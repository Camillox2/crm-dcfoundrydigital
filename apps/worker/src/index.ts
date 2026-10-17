import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  downloadContentFromMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { createSessionManager } from './whatsapp-session.js';
import type { WhatsAppCommand, WhatsAppEvent } from '@dcfoundry/shared';
import { mapMediaMessage, createLivePhotos, executeLiveCommand } from './live-media.js';
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for the WhatsApp worker.');
process.umask(0o077);
const producer = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const consumer = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
producer.on('error', () => undefined);
consumer.on('error', () => undefined);
const events = new Queue<WhatsAppEvent>('dc-wa-events', { connection: producer });
const logger = pino({ level: 'silent' });
const emit = async (event: WhatsAppEvent) => {
  await events.add(event.type, event, {
    jobId: event.id,
    attempts: 10,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  });
};
const photos = createLivePhotos(),
  uploads = process.env.CRM_UPLOAD_DIR || '/data/uploads';
const manager = createSessionManager({
  directory: process.env.WHATSAPP_SESSION_DIR || '/data/whatsapp',
  emit,
  onMessage: (raw, historical, command) =>
    mapMediaMessage(
      raw,
      historical,
      command,
      (content, type) => downloadContentFromMessage(content, type as 'image'),
      uploads,
    ),
  onCommand: (command, socket) => executeLiveCommand(command, socket, emit, uploads, photos),
  factory: async (directory) => {
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      shouldSyncHistoryMessage: () => true,
    });
    return { socket, saveCreds, registered: state.creds.registered };
  },
});
const commands = new Worker<WhatsAppCommand>('dc-wa-commands', (job) => manager.command(job.data), {
  connection: consumer,
  concurrency: 1,
});
commands.on('error', () => console.error('WhatsApp command queue unavailable; reconnecting.'));
commands.on('failed', (job) => {
  if (
    job?.data.type === 'send' &&
    job.data.messageId &&
    job.attemptsMade >= (job.opts.attempts ?? 1)
  )
    void emit({
      id: randomUUID(),
      sessionId: job.data.sessionId,
      generation: job.data.generation,
      type: 'receipt',
      jid: job.data.jid,
      externalId: job.data.messageId.replaceAll('-', '').toUpperCase(),
      delivery: 'failed',
    }).catch(() => undefined);
});
await manager.restore();
const stop = async () => {
  manager.close();
  await commands.close();
  await events.close();
  await producer.quit();
  await consumer.quit();
};
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
console.log(
  'Foundry WhatsApp worker ready. Pairing and status are available in the authenticated CRM.',
);

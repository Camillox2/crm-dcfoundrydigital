import { DelayedError, Queue, Worker } from 'bullmq';
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
import { acquireWorkerLease } from './worker-lease.js';
import { createSendLimit } from './send-limit.js';
import { foundrySendDecision } from './foundry-send-gate.js';
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for the WhatsApp worker.');
process.umask(0o077);
const ownership = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 5000,
  commandTimeout: 4000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
ownership.on('error', () => undefined);
await ownership.connect();
let shutdown: (() => Promise<void>) | undefined;
const lease = await acquireWorkerLease(ownership, () => {
  process.exitCode = 1;
  void shutdown?.();
  setTimeout(() => process.exit(1), 10000).unref();
});
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
  directory: process.env.WHATSAPP_SESSION_DIR || '/data/whatsapp-auth',
  assertOwner: lease.assertOwner,
  emit,
  onMessage: (raw, historical, command) =>
    mapMediaMessage(
      raw,
      historical,
      command,
      (content, type) => downloadContentFromMessage(content, type as 'image'),
      uploads,
    ),
  onCommand: async (command, socket) => {
    if (command.actorType === 'foundry') {
      const [enabled, raw] = await Promise.all([
        producer.get('dc-wa-ai-enabled'),
        producer.hget('dc-wa-ai-controls', command.leadId ?? ''),
      ]);
      let control: { revision?: unknown; paused?: unknown } | null = null;
      if (raw) {
        try {
          control = JSON.parse(raw);
        } catch {
          throw new Error('Foundry control record is unreadable');
        }
      }
      const decision = foundrySendDecision({
        enabled,
        control,
        aiRevision: command.aiRevision,
        handoffAck: command.handoffAck,
      });
      if (decision === 'retry')
        throw new Error('Foundry send is waiting for the current control record');
      if (decision === 'drop') {
        if (command.messageId)
          await emit({
            id: randomUUID(),
            sessionId: command.sessionId,
            generation: command.generation,
            type: 'receipt',
            jid: command.jid,
            externalId: command.messageId.replaceAll('-', '').toUpperCase(),
            delivery: 'failed',
          });
        return;
      }
    }
    await executeLiveCommand(command, socket, emit, uploads, photos);
  },
  factory: async (directory) => {
    lease.assertOwner();
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    lease.assertOwner();
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
const sendLimit = createSendLimit(ownership);
const commands = new Worker<WhatsAppCommand>(
  'dc-wa-commands',
  async (job, token) => {
    lease.assertOwner();
    if (job.data.type === 'send') {
      const delay = await sendLimit.reserve();
      if (delay) {
        await job.moveToDelayed(Date.now() + delay, token);
        throw new DelayedError();
      }
    }
    await manager.command(job.data);
  },
  {
    connection: consumer,
    concurrency: 1,
    autorun: false,
  },
);
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
let stopping = false;
const stop = (shutdown = async () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(process.exitCode ? 1 : 0), 10000);
  deadline.unref();
  try {
    await manager.close();
    await commands.close(true);
    await events.close();
    await lease.close().catch(() => undefined);
    ownership.disconnect();
    producer.disconnect();
    consumer.disconnect();
  } finally {
    clearTimeout(deadline);
  }
});
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
await manager.restore();
void commands.run().catch(() => {
  process.exitCode = 1;
  void stop();
});
console.log(
  'Foundry WhatsApp worker ready. Pairing and status are available in the authenticated CRM.',
);

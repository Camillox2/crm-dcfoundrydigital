import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WhatsAppEventSchema, type WhatsAppCommand, type WhatsAppEvent } from '@dcfoundry/shared';
import { WhatsAppStore } from './whatsapp-store.js';
export interface WhatsAppTransport {
  publish(command: WhatsAppCommand): Promise<void>;
  close(): Promise<void>;
}
export async function flushWhatsAppCommands(store: WhatsAppStore, transport: WhatsAppTransport) {
  for (const command of await store.pending()) {
    await transport.publish(command);
    await store.pool.query('UPDATE wa_commands SET published_at=now() WHERE id=$1', [command.id]);
  }
}
export function startWhatsAppTransport(
  url: string,
  receive: (event: WhatsAppEvent) => Promise<void>,
): WhatsAppTransport {
  const producer = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  const consumer = new Redis(url, { maxRetriesPerRequest: null });
  producer.on('error', () => undefined);
  consumer.on('error', () => undefined);
  const queue = new Queue<WhatsAppCommand>('dc-wa-commands', { connection: producer });
  const worker = new Worker(
    'dc-wa-events',
    async (job) => receive(WhatsAppEventSchema.parse(job.data)),
    { connection: consumer, concurrency: 1 },
  );
  worker.on('error', () => undefined);
  return {
    async publish(command) {
      await queue.add(command.type, command, {
        jobId: command.id,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      });
    },
    async close() {
      await worker.close();
      await queue.close();
      await producer.quit();
      await consumer.quit();
    },
  };
}

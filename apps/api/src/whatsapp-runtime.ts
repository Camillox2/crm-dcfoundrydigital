import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WhatsAppEventSchema, type WhatsAppCommand, type WhatsAppEvent } from '@dcfoundry/shared';
import { WhatsAppStore } from './whatsapp-store.js';
export interface WhatsAppTransport {
  publish(command: WhatsAppCommand): Promise<void>;
  close(): Promise<void>;
  control?(leadId: string, revision: number, paused: boolean): Promise<void>;
  enabled?(enabled: boolean): Promise<void>;
}
export async function flushWhatsAppCommands(store: WhatsAppStore, transport: WhatsAppTransport) {
  for (const command of await store.pending()) {
    if (command.actorType === 'foundry' && command.leadId) {
      const control = (
        await store.pool.query(
          'SELECT ai_control_revision,ai_paused FROM workspace_leads WHERE id=$1',
          [command.leadId],
        )
      ).rows[0];
      if (
        !control ||
        control.ai_control_revision !== command.aiRevision ||
        (control.ai_paused && !command.handoffAck)
      ) {
        await store.pool.query('UPDATE wa_commands SET cancelled_at=now() WHERE id=$1', [
          command.id,
        ]);
        continue;
      }
      await transport.control?.(command.leadId, control.ai_control_revision, control.ai_paused);
    }
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
    async control(leadId, revision, paused) {
      await producer.hset('dc-wa-ai-controls', leadId, JSON.stringify({ revision, paused }));
    },
    async enabled(enabled) {
      // Persistent on purpose: a 15s TTL expired while a send waited in the rate limit
      // and the worker then dropped the Foundry reply.
      await producer.set('dc-wa-ai-enabled', enabled ? '1' : '0');
    },
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

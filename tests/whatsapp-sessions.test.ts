import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import {
  directIdentity,
  canonicalWhatsAppStatus,
  type WhatsAppEvent,
  type WhatsAppCommand,
} from '@dcfoundry/shared';
import { createSessionManager, type SessionSocket } from '../apps/worker/src/whatsapp-session.js';
import { WhatsAppStore } from '../apps/api/src/whatsapp-store.js';
import { flushWhatsAppCommands } from '../apps/api/src/whatsapp-runtime.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { testDatabase } from './helpers/database.js';
const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) await close();
});
it('never interprets a LID as E.164 and canonicalizes the stale provider status', () => {
  expect(directIdentity('123456789:4@lid')).toEqual({ jid: '123456789@lid', phone: null });
  expect(directIdentity('123456789@lid', '5541999999999@s.whatsapp.net')?.phone).toBe(
    '+5541999999999',
  );
  expect(directIdentity('123@g.us')).toBeNull();
  expect(canonicalWhatsAppStatus('baileys', 'connected_meta')).toBe('disconnected');
});
it('persists credentials, pairs, reconnects and restores a saved session without a live provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dc-session-test-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const events: WhatsAppEvent[] = [],
    sockets: EventEmitter[] = [];
  const pairing = vi.fn(async () => '1234-5678'),
    save = vi.fn(async () => {}),
    timers: Array<() => void> = [];
  const factory = vi.fn(async () => {
    const ev = new EventEmitter();
    sockets.push(ev);
    return {
      socket: {
        ev,
        requestPairingCode: pairing,
        end: vi.fn(),
        fetchMessageHistory: vi.fn(),
        sendMessage: vi.fn(),
        profilePictureUrl: vi.fn(),
      } as unknown as SessionSocket,
      saveCreds: save,
      registered: false,
    };
  });
  const manager = createSessionManager({
    directory,
    factory,
    emit: async (event) => {
      events.push(event);
    },
    schedule: (callback) => {
      timers.push(callback);
      return setTimeout(() => {}, 100000);
    },
  });
  cleanup.push(() => manager.close());
  const command: WhatsAppCommand = {
    id: randomUUID(),
    sessionId: randomUUID(),
    generation: 1,
    type: 'connect',
    provider: 'baileys',
    phone: '+5541999999999',
  };
  await manager.command(command);
  sockets[0]!.emit('creds.update', {});
  sockets[0]!.emit('connection.update', { qr: 'fixture-qr' });
  await vi.waitFor(() => expect(events.some((e) => e.pairingCode === '1234-5678')).toBe(true));
  expect(pairing).toHaveBeenCalledWith('5541999999999');
  expect(save).toHaveBeenCalledOnce();
  sockets[0]!.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 428 } } },
  });
  await vi.waitFor(() => expect(timers).toHaveLength(1));
  timers.shift()!();
  await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
  await manager.command({ ...command, generation: 2, provider: 'meta' });
  expect(manager.socket(command.sessionId)).toBeUndefined();
  expect(events.at(-1)?.status).toBe('disconnected');
  await manager.command({ ...command, generation: 3, phone: undefined });
  manager.close();
  await manager.restore();
  expect(factory).toHaveBeenCalledTimes(4);
});
it('stores history idempotently, enforces owner scope and survives Redis delivery failure', async () => {
  const database = await testDatabase();
  cleanup.push(() => database.pool.end());
  const owner = randomUUID(),
    other = randomUUID();
  await database.pool.query(
    `INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@tests.example','Owner','hash'),($2,'other@tests.example','Other','hash')`,
    [owner, other],
  );
  const actor = { id: owner, scope: 'own' as const, teamId: null },
    repo = new WhatsAppStore(database.pool);
  const id = await repo.connect(actor, { provider: 'baileys', importHistory: true });
  await expect(repo.session(id, { ...actor, id: other })).rejects.toThrow('Sessão');
  await expect(
    flushWhatsAppCommands(repo, {
      publish: async () => {
        throw Error('Redis down');
      },
      close: async () => {},
    }),
  ).rejects.toThrow('Redis down');
  expect(await repo.pending()).toHaveLength(1);
  await flushWhatsAppCommands(repo, { publish: async () => {}, close: async () => {} });
  expect(await repo.pending()).toHaveLength(0);
  const event: WhatsAppEvent = {
    id: randomUUID(),
    sessionId: id,
    generation: 1,
    type: 'messages',
    messages: [
      {
        externalId: 'mock-message-1',
        jid: '12345@lid',
        phone: '+5541999999999',
        name: 'Cliente teste',
        text: 'Preciso de um site',
        fromMe: false,
        historical: true,
        timestamp: new Date().toISOString(),
        type: 'text',
      },
    ],
  };
  expect(await repo.ingest(event)).toHaveLength(1);
  expect(await repo.ingest(event)).toHaveLength(0);
  await repo.ingest({ ...event, id: randomUUID() });
  expect((await database.pool.query('SELECT * FROM wa_messages')).rows).toHaveLength(1);
  await repo.connect(actor, { provider: 'baileys', importHistory: false }, id);
  await repo.ingest({
    id: randomUUID(),
    sessionId: id,
    generation: 1,
    type: 'status',
    status: 'connected',
  });
  expect((await repo.session(id, actor)).status).toBe('disconnected');
  const { app } = await buildApiServer({
    testDatabase: database,
    whatsappTransport: { publish: async () => {}, close: async () => {} },
  });
  cleanup.push(() => app.close());
  const token = signAccessToken({
    id: other,
    email: 'other@tests.example',
    fullName: 'Other',
    roles: ['vendedor'],
    teamId: null,
  });
  const denied = await app.inject({
    method: 'POST',
    url: `/api/v1/whatsapp/sessions/${id}/connect`,
    headers: { authorization: `Bearer ${token}` },
    payload: { provider: 'baileys' },
  });
  expect(denied.statusCode).toBe(403);
  expect((await app.inject({ url: '/api/v1/whatsapp/sessions' })).statusCode).toBe(401);
}, 30000);

import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizePhoneE164,
  canonicalWhatsAppStatus,
  type WhatsAppCommand,
  type WhatsAppEvent,
  WhatsAppStatus,
} from '@dcfoundry/shared';
import { createSessionManager, resetWhatsAppSession } from '../apps/worker/src/whatsapp-session.js';
import { acquireWorkerLease, type LeaseRedis } from '../apps/worker/src/worker-lease.js';
import { createSendLimit, reserveSendScript } from '../apps/worker/src/send-limit.js';
import { executeLiveCommand, createLivePhotos } from '../apps/worker/src/live-media.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { testDatabase } from './helpers/database.js';

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of cleanup.splice(0).reverse()) await close();
});
const connectCommand = (): WhatsAppCommand => ({
  id: randomUUID(),
  sessionId: randomUUID(),
  generation: 1,
  type: 'connect',
  provider: 'baileys',
});
const socketMock = () => ({
  ev: new EventEmitter(),
  user: { id: '5541999999999:4@s.whatsapp.net' },
  requestPairingCode: vi.fn(async () => '9999-8888'),
  end: vi.fn(),
  profilePictureUrl: vi.fn(
    async (_jid: string, _type: 'image'): Promise<string | undefined> => undefined,
  ),
  fetchMessageHistory: vi.fn(async () => undefined),
  sendMessage: vi.fn(
    async (_jid: string, _content: unknown, options?: Record<string, unknown>) => ({
      key: { id: String(options?.messageId) },
    }),
  ),
});

it('resets only the named auth folder and rejects traversal without touching sibling sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dc-reset-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const id = randomUUID(),
    other = randomUUID();
  for (const session of [id, other]) {
    await mkdir(join(directory, session));
    await writeFile(join(directory, session, 'creds.json'), 'DUMMY_AUTH');
  }
  await expect(resetWhatsAppSession(directory, '../' + other)).rejects.toThrow('UUID');
  await resetWhatsAppSession(directory, id);
  await expect(readFile(join(directory, id, 'creds.json'))).rejects.toThrow();
  expect(await readFile(join(directory, other, 'creds.json'), 'utf8')).toBe('DUMMY_AUTH');
});

it('normalizes local and international phones, rejects invalid identities and never keeps a provider-specific status', () => {
  for (const input of [
    '(41) 99999-9999',
    '041999999999',
    '5541999999999',
    '+55 (41) 99999-9999',
    '005541999999999',
  ])
    expect(normalizePhoneE164(input)).toBe('+5541999999999');
  expect(normalizePhoneE164('+1 (212) 555-0123')).toBe('+12125550123');
  for (const input of [
    '',
    '123',
    '+01234567890',
    '+1234567890123456',
    'nome 41999999999',
    '55+41999999999',
  ])
    expect(() => normalizePhoneE164(input)).toThrow();
  for (const status of WhatsAppStatus.options)
    expect(canonicalWhatsAppStatus('baileys', status)).toBe(status);
  for (const provider of ['meta', 'disabled'])
    expect(canonicalWhatsAppStatus(provider, 'connected')).toBe('disconnected');
  for (const status of ['connected_meta', 'qr_ready', 'unknown'])
    expect(canonicalWhatsAppStatus('baileys', status)).toBe('disconnected');
});

it('flushes pairing credentials before a 515 restart, clears confirmed logout and generates a fresh QR', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dc-recovery-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const command = connectCommand(),
    events: WhatsAppEvent[] = [],
    sockets: ReturnType<typeof socketMock>[] = [],
    registered: boolean[] = [];
  let releaseSave!: () => void;
  const saving = new Promise<void>((done) => {
    releaseSave = done;
  });
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const factory = vi.fn(async (folder: string) => {
    const socket = socketMock();
    sockets.push(socket);
    const exists = await readFile(join(folder, 'creds.json')).then(
      () => true,
      () => false,
    );
    registered.push(exists);
    return {
      socket,
      registered: exists,
      saveCreds: async () => {
        await saving;
        await writeFile(join(folder, 'creds.json'), 'TEST_CREDENTIALS_ONLY');
      },
    };
  });
  const manager = createSessionManager({
    directory,
    factory,
    emit: async (event) => {
      events.push(event);
    },
    schedule: (callback, delay) => {
      timers.push({ callback, delay });
      return setTimeout(() => {}, 100000).unref();
    },
  });
  cleanup.push(async () => {
    releaseSave();
    await manager.close();
  });
  await manager.command(command);
  await manager.command(command); // BullMQ may replay an already completed command.
  expect(factory).toHaveBeenCalledTimes(1);
  const staleConnection = sockets[0]!.ev.listeners('connection.update')[0]!;
  sockets[0]!.ev.emit('creds.update', {});
  sockets[0]!.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 515 } } },
  });
  await vi.waitFor(() => expect(sockets[0]!.end).toHaveBeenCalledOnce());
  expect(timers).toHaveLength(0); // Restart waits for the credentials write.
  releaseSave();
  await vi.waitFor(() => expect(timers).toHaveLength(1));
  expect(timers[0]!.delay).toBe(2000);
  timers.shift()!.callback();
  await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
  expect(registered).toEqual([false, true]);
  sockets[1]!.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 401 } } },
  });
  await vi.waitFor(() => expect(timers).toHaveLength(1));
  await expect(readFile(join(directory, command.sessionId, 'creds.json'))).rejects.toThrow();
  timers.shift()!.callback();
  await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(3));
  expect(registered).toEqual([false, true, false]);
  sockets[2]!.ev.emit('connection.update', { qr: 'NEW_TEST_QR' });
  await vi.waitFor(() =>
    expect(
      events.some((e) => e.status === 'qr' && e.qr?.startsWith('data:image/png;base64,')),
    ).toBe(true),
  );
  const before = events.length;
  staleConnection({ connection: 'open' });
  await manager.command({ ...command, id: randomUUID(), generation: 2, provider: 'meta' });
  expect(events.slice(before).some((e) => e.status === 'connected')).toBe(false);
  expect(events.at(-1)?.status).toBe('disconnected');
  expect(manager.socket(command.sessionId)).toBeUndefined();
});

it('serializes concurrent connects and stops reconnecting when another connection replaces the socket', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dc-single-socket-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const sockets: ReturnType<typeof socketMock>[] = [],
    timers: Array<() => void> = [];
  const factory = vi.fn(async () => {
    // A previous socket must be closed before a new one is constructed.
    for (const old of sockets) expect(old.end).toHaveBeenCalledOnce();
    const socket = socketMock();
    sockets.push(socket);
    return { socket, registered: true, saveCreds: async () => {} };
  });
  const manager = createSessionManager({
    directory,
    factory,
    emit: async () => {},
    schedule: (callback) => {
      timers.push(callback);
      return setTimeout(() => {}, 100000).unref();
    },
  });
  cleanup.push(() => manager.close());
  const command = connectCommand();
  await Promise.all([
    manager.command(command),
    manager.command({ ...command, id: randomUUID(), generation: 2 }),
  ]);
  expect(factory).toHaveBeenCalledTimes(2);
  sockets[1]!.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 440 } } },
  });
  await vi.waitFor(() => expect(manager.socket(command.sessionId)).toBeUndefined());
  expect(timers).toHaveLength(0);
  await manager.close();
  await manager.restore();
  expect(factory).toHaveBeenCalledTimes(2);
});

it('allows one worker lease, stops on expiry or Redis failure and never deletes a replacement owner', async () => {
  let now = 0,
    entry: { value: string; expires: number } | undefined;
  const redis: LeaseRedis = {
    set: vi.fn(async (_key, value, _px, ttl) => {
      if (entry && entry.expires > now) return null;
      entry = { value, expires: now + ttl };
      return 'OK';
    }),
    eval: vi.fn(async (script, _count, _key, value, ttl) => {
      if (!entry || entry.value !== value || entry.expires <= now) return 0;
      if (script.includes('pexpire')) entry.expires = now + Number(ttl);
      else entry = undefined;
      return 1;
    }),
  };
  const lost = vi.fn(),
    lease = await acquireWorkerLease(redis, lost, { clock: () => now });
  cleanup.push(() => lease.close());
  await expect(acquireWorkerLease(redis, vi.fn(), { clock: () => now })).rejects.toThrow(
    'Another WhatsApp worker',
  );
  now = 10000;
  await lease.refresh();
  lease.assertOwner();
  now = 41000;
  const replacement = await acquireWorkerLease(redis, vi.fn(), { clock: () => now });
  cleanup.push(() => replacement.close());
  expect(() => lease.assertOwner()).toThrow('expired');
  expect(lost).toHaveBeenCalledOnce();
  await lease.close();
  expect(entry).toBeDefined();
  replacement.assertOwner();
  vi.mocked(redis.eval).mockRejectedValueOnce(new Error('Redis unavailable'));
  await replacement.refresh();
  expect(() => replacement.assertOwner()).toThrow('expired');
});

it('uses the shared Redis window for sends and rejects a broken rate limiter', async () => {
  const redis = { eval: vi.fn(async () => 0) };
  const limit = createSendLimit(redis, 2);
  expect(await limit.reserve()).toBe(0);
  expect(redis.eval).toHaveBeenCalledWith(
    reserveSendScript,
    1,
    'dc-wa-send-window',
    2,
    expect.any(String),
  );
  redis.eval.mockResolvedValueOnce(58000);
  expect(await createSendLimit(redis, 2).reserve()).toBe(58000);
  redis.eval.mockResolvedValueOnce(-1);
  await expect(limit.reserve()).rejects.toThrow('Invalid');
  expect(() => createSendLimit(redis, 0)).toThrow();
});

it('upgrades historical aliases into one typed conversation and preserves the contact pause', async () => {
  const owner = randomUUID(),
    lead = randomUUID(),
    session = randomUUID();
  const database = await testDatabase(async (name, db) => {
    if (name !== '0016_whatsapp_worker_recovery.sql') return;
    await db.query(
      "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'migration@wa-tests.example','Test migration','hash')",
      [owner],
    );
    await db.query(
      "INSERT INTO workspace_leads(id,owner_id,name,company,phone,ai_paused) VALUES($1,$2,'Test','Test','+5541999999999',true)",
      [lead, owner],
    );
    await db.query('INSERT INTO wa_sessions(id,owner_id) VALUES($1,$2)', [session, owner]);
    for (const [index, jid] of ['12345678@lid', '5541999999999@s.whatsapp.net'].entries()) {
      await db.query('INSERT INTO wa_identities(session_id,lead_id,jid) VALUES($1,$2,$3)', [
        session,
        lead,
        jid,
      ]);
      await db.query(
        "INSERT INTO wa_messages(session_id,lead_id,external_id,jid,direction,actor_type,body,sent_at) VALUES($1,$2,$3,$4,'inbound','contact','Historical test',now())",
        [session, lead, 'old-' + index, jid],
      );
    }
  });
  cleanup.push(() => database.pool.end());
  const conversations = (await database.pool.query('SELECT * FROM wa_conversations')).rows;
  expect(conversations).toHaveLength(1);
  expect(conversations[0].ai_enabled).toBe(false);
  expect(conversations[0].last_message_at).not.toBeNull();
  await database.pool.query(
    'UPDATE workspace_leads SET ai_paused=false,ai_control_revision=ai_control_revision+1 WHERE id=$1',
    [lead],
  );
  expect(
    (await database.pool.query('SELECT ai_enabled,control_revision FROM wa_conversations')).rows[0],
  ).toMatchObject({ ai_enabled: true, control_revision: 2 });
  expect((await database.pool.query('SELECT id FROM wa_messages')).rows).toHaveLength(2);
});

it('pairs through the authenticated API, receives leads, lists scoped conversations, sends through Baileys and fences disconnects', async () => {
  vi.stubEnv('WHATSAPP_SENDS_PER_MINUTE', '2');
  const database = await testDatabase(),
    directory = await mkdtemp(join(tmpdir(), 'dc-wa-endtoend-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  cleanup.push(() => database.pool.end());
  const admin = randomUUID(),
    other = randomUUID();
  await database.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'admin@wa-tests.example','Test admin','hash'),($2,'other@wa-tests.example','Test other','hash')",
    [admin, other],
  );
  const existing = (
    await database.pool.query(
      "INSERT INTO workspace_leads(owner_id,name,company,phone) VALUES($1,'Existing test','Test agency','+5541999999999') RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const headers = (role: 'admin' | 'gestor' | 'vendedor', id = admin) => ({
    authorization:
      'Bearer ' +
      signAccessToken({
        id,
        email: 'test@example.test',
        fullName: 'Test',
        roles: [role],
        teamId: null,
        totpEnabled: false,
      }),
  });
  const sockets: ReturnType<typeof socketMock>[] = [],
    published: WhatsAppCommand[] = [];
  let manager: ReturnType<typeof createSessionManager>;
  const generate = vi.fn(),
    livePhotos = createLivePhotos();
  const { app, whatsapp } = await buildApiServer({
    testDatabase: database,
    foundryGenerate: generate,
    whatsappTransport: {
      publish: async (command) => {
        published.push(command);
        await manager.command(command);
      },
      close: async () => {},
    },
  });
  cleanup.push(() => app.close());
  manager = createSessionManager({
    directory,
    emit: whatsapp.processEvent,
    factory: async () => {
      const socket = socketMock();
      sockets.push(socket);
      socket.profilePictureUrl.mockImplementation(async (jid) =>
        jid.startsWith('5541999999999') ? 'https://mmg.whatsapp.net/test-profile.jpg' : undefined,
      );
      return { socket, registered: false, saveCreds: async () => {} };
    },
    onCommand: (command, socket) =>
      executeLiveCommand(command, socket, whatsapp.processEvent, directory, livePhotos),
  });
  cleanup.push(() => manager.close());
  const status = '/api/v1/whatsapp/status';
  expect((await app.inject({ url: status })).statusCode).toBe(401);
  expect((await app.inject({ url: status, headers: headers('admin') })).json().status).toBe(
    'disconnected',
  );
  for (const action of ['connect', 'disconnect', 'pair-code'])
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/whatsapp/' + action,
          headers: headers('gestor'),
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  const connected = await app.inject({
    method: 'POST',
    url: '/api/v1/whatsapp/connect',
    headers: headers('admin'),
    payload: {},
  });
  expect(connected.statusCode, connected.body).toBe(202);
  const id = connected.json().id;
  sockets[0]!.ev.emit('connection.update', { qr: 'API_QR_TEST' });
  await vi.waitFor(async () =>
    expect((await app.inject({ url: status, headers: headers('admin') })).json().qr).toMatch(
      /^data:image\/png;base64,/,
    ),
  );
  expect((await app.inject({ url: status, headers: headers('gestor') })).json().qr).toBeNull();
  await database.pool.query(
    "UPDATE wa_sessions SET credentials_expires_at=now()-interval '1 second' WHERE id=$1",
    [id],
  );
  expect((await app.inject({ url: status, headers: headers('admin') })).json().qr).toBeNull();
  sockets[0]!.ev.emit('connection.update', { connection: 'open' });
  await vi.waitFor(async () =>
    expect((await app.inject({ url: status, headers: headers('admin') })).json().phone).toBe(
      '+5541999999999',
    ),
  );
  for (const [externalId, jid, alternate] of [
    ['first', '5541999999999@s.whatsapp.net', undefined],
    ['lid', '12345678@lid', '5541999999999@s.whatsapp.net'],
    ['new', '5541888888888@s.whatsapp.net', undefined],
    ['unresolved', '99887766@lid', undefined],
  ]) {
    sockets[0]!.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: externalId, remoteJid: jid, remoteJidAlt: alternate },
          pushName: 'TEST CONTACT',
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: { conversation: 'Preciso de um site 👋' },
        },
      ],
    });
  }
  await vi.waitFor(async () =>
    expect((await database.pool.query('SELECT id FROM wa_messages')).rows).toHaveLength(4),
  );
  expect((await database.pool.query('SELECT id FROM workspace_leads')).rows).toHaveLength(3);
  const unresolved = (
    await database.pool.query(
      "SELECT l.id,l.phone FROM workspace_leads l JOIN wa_identities i ON i.lead_id=l.id WHERE i.jid='99887766@lid'",
    )
  ).rows[0];
  expect(unresolved.phone).toBe('');
  sockets[0]!.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [
      {
        key: {
          id: 'resolved',
          remoteJid: '99887766@lid',
          remoteJidAlt: '5541777777777@s.whatsapp.net',
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'Contato agora com telefone' },
      },
    ],
  });
  await vi.waitFor(async () =>
    expect(
      (await database.pool.query('SELECT phone FROM workspace_leads WHERE id=$1', [unresolved.id]))
        .rows[0].phone,
    ).toBe('+5541777777777'),
  );
  expect((await database.pool.query('SELECT id FROM workspace_leads')).rows).toHaveLength(3);
  expect(
    (await database.pool.query('SELECT whatsapp_enabled FROM foundry_settings')).rows[0]
      .whatsapp_enabled,
  ).toBe(false);
  expect(generate).not.toHaveBeenCalled();
  const conversations = '/api/v1/whatsapp/sessions/' + id + '/conversations';
  const items = (await app.inject({ url: conversations, headers: headers('admin') })).json().items;
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveProperty('ai_enabled');
  expect(items[0].conversation_id).toMatch(/^[a-f0-9-]{36}$/);
  expect((await database.pool.query('SELECT id FROM wa_conversations')).rows).toHaveLength(3);
  expect(
    (await app.inject({ url: conversations, headers: headers('vendedor', other) })).json().items,
  ).toHaveLength(0);
  const path = '/api/v1/whatsapp/sessions/' + id + '/leads/' + existing;
  expect(
    (await app.inject({ url: path + '/messages', headers: headers('vendedor', other) })).statusCode,
  ).toBe(404);
  const first = randomUUID();
  for (const requestId of [first, first, randomUUID()]) {
    const sent = await app.inject({
      method: 'POST',
      url: path + '/messages',
      headers: headers('admin'),
      payload: { requestId, text: 'Mensagem humana de teste' },
    });
    expect(sent.statusCode, sent.body).toBe(202);
  }
  expect(sockets[0]!.sendMessage).toHaveBeenCalledTimes(2);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: path + '/messages',
        headers: headers('admin'),
        payload: { requestId: randomUUID(), text: 'Acima do limite' },
      })
    ).statusCode,
  ).toBe(429);
  expect(
    (
      await database.pool.query(
        "SELECT delivery FROM wa_messages WHERE direction='outbound' AND delivery='sent'",
      )
    ).rows,
  ).toHaveLength(2);
  expect(
    (
      await database.pool.query(
        'SELECT ai_enabled FROM wa_conversations WHERE session_id=$1 AND lead_id=$2',
        [id, existing],
      )
    ).rows[0].ai_enabled,
  ).toBe(false);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/disconnect',
        headers: headers('admin'),
        payload: {},
      })
    ).statusCode,
  ).toBe(202);
  await whatsapp.processEvent({
    id: randomUUID(),
    sessionId: id,
    generation: 1,
    type: 'status',
    status: 'connected',
  });
  expect((await app.inject({ url: status, headers: headers('admin') })).json().status).toBe(
    'disconnected',
  );
  await manager.command(published.find((c) => c.type === 'send')!);
  expect(sockets[0]!.sendMessage).toHaveBeenCalledTimes(2);
  const pair = await app.inject({
    method: 'POST',
    url: '/api/v1/whatsapp/pair-code',
    headers: headers('admin'),
    payload: { phone: '+5541999999999' },
  });
  expect(pair.statusCode, pair.body).toBe(202);
  sockets[1]!.ev.emit('connection.update', { qr: 'PAIRING_TEST' });
  await vi.waitFor(async () =>
    expect((await app.inject({ url: status, headers: headers('admin') })).json().pairing_code).toBe(
      '9999-8888',
    ),
  );
}, 30000);

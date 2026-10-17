import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLivePhotos,
  executeLiveCommand,
  mapMediaMessage,
  safeMediaKey,
  writeLimitedMedia,
} from '../apps/worker/src/live-media.js';
import type { SessionSocket } from '../apps/worker/src/whatsapp-session.js';
import type { WhatsAppEvent, WhatsAppCommand } from '@dcfoundry/shared';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
it('bounds file downloads and caches missing/private photos per session generation', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'dc-media-test-'));
  try {
    expect(() => safeMediaKey('../credentials')).toThrow();
    await expect(
      writeLimitedMedia(
        (async function* () {
          yield Buffer.alloc(16 * 1024 * 1024 + 1);
        })(),
        folder,
      ),
    ).rejects.toThrow('16 MB');
    const socket = { profilePictureUrl: vi.fn(async () => undefined) } as unknown as SessionSocket,
      photos = createLivePhotos();
    expect(await photos(socket, 'session', 1, '123@lid')).toBeNull();
    expect(await photos(socket, 'session', 1, '123@lid')).toBeNull();
    expect(socket.profilePictureUrl).toHaveBeenCalledTimes(1);
    await photos(socket, 'session', 2, '123@lid');
    expect(socket.profilePictureUrl).toHaveBeenCalledTimes(2);
    const raw = {
      key: { id: 'media-1', remoteJid: '5541999999999@s.whatsapp.net' },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { imageMessage: { caption: 'Briefing', mimetype: 'image/jpeg', fileLength: 3 } },
    };
    const download = vi.fn(async () =>
      (async function* () {
        yield Buffer.from('img');
      })(),
    );
    const mapped = await mapMediaMessage(raw, false, {} as WhatsAppCommand, download, folder);
    expect(mapped?.[0]?.mediaBytes).toBe(3);
    expect(mapped?.[0]?.type).toBe('image');
    await mapMediaMessage(raw, true, {} as WhatsAppCommand, download, folder);
    expect(download).toHaveBeenCalledTimes(1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
it('delivers API → persistent outbox → mocked Baileys → API receipts, and isolates media', async () => {
  const database = await testDatabase(),
    folder = await mkdtemp(join(tmpdir(), 'dc-api-media-')),
    previous = process.env.CRM_UPLOAD_DIR;
  process.env.CRM_UPLOAD_DIR = folder;
  const owner = randomUUID(),
    other = randomUUID();
  await database.pool.query(
    `INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@chat.example','Owner','hash'),($2,'other@chat.example','Other','hash')`,
    [owner, other],
  );
  const published: WhatsAppCommand[] = [];
  const { app, whatsapp } = await buildApiServer({
    testDatabase: database,
    whatsappTransport: {
      publish: async (command) => {
        published.push(command);
      },
      close: async () => {},
    },
  });
  const headers = (id: string, roles: ('admin' | 'vendedor' | 'atendente')[]) => ({
    authorization: `Bearer ${signAccessToken({ id, email: id + '@test.example', fullName: 'Test', roles, teamId: null, totpEnabled: false })}`,
  });
  try {
    const sessionId = await (
      await whatsapp.store()
    ).connect(
      { id: owner, teamId: null, scope: 'all' },
      { provider: 'baileys', importHistory: false },
    );
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'status',
      status: 'qr',
      qr: 'data:image/png;base64,aW1n',
    });
    expect(
      (
        await app.inject({
          url: '/api/v1/whatsapp/sessions',
          headers: headers(other, ['atendente']),
        })
      ).json().items[0].qr,
    ).toBeNull();
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'status',
      status: 'connected',
    });
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'messages',
      messages: [
        {
          externalId: 'in-1',
          jid: '5541999999999@s.whatsapp.net',
          phone: '+5541999999999',
          name: 'Cliente',
          text: 'Olá 👋',
          fromMe: false,
          historical: false,
          timestamp: new Date().toISOString(),
          type: 'text',
        },
      ],
    });
    const lead = (await database.pool.query('SELECT * FROM workspace_leads')).rows[0],
      path = `/api/v1/whatsapp/sessions/${sessionId}/leads/${lead.id}`;
    expect(
      (await app.inject({ url: path + '/messages', headers: headers(other, ['vendedor']) }))
        .statusCode,
    ).toBe(404);
    const upload = await app.inject({
      method: 'POST',
      url: path + '/media',
      headers: headers(owner, ['admin']),
      payload: {
        name: 'briefing.txt',
        mime: 'text/plain',
        base64: Buffer.from('Briefing aprovado').toString('base64'),
      },
    });
    expect(upload.statusCode, upload.body).toBe(201);
    const requestId = randomUUID(),
      payload = { text: 'Recebemos seu briefing ✅', mediaId: upload.json().id, requestId };
    for (let n = 0; n < 2; n++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: path + '/messages',
            headers: headers(owner, ['admin']),
            payload,
          })
        ).statusCode,
      ).toBe(202);
    expect(
      (await database.pool.query("SELECT * FROM wa_messages WHERE direction='outbound'")).rows,
    ).toHaveLength(1);
    const command = published.find((c) => c.type === 'send')!;
    expect(command.media?.type).toBe('file');
    const socket = {
      sendMessage: vi.fn(async (_jid, _content, options) => ({ key: { id: options.messageId } })),
    } as unknown as SessionSocket;
    await executeLiveCommand(
      command,
      socket,
      (event) => whatsapp.processEvent(event),
      folder,
      createLivePhotos(),
    );
    expect(
      (await database.pool.query('SELECT delivery FROM wa_messages WHERE id=$1', [requestId]))
        .rows[0].delivery,
    ).toBe('sent');
    const media = await app.inject({
      url: path + `/messages/${requestId}/media`,
      headers: headers(owner, ['admin']),
    });
    expect(media.statusCode).toBe(200);
    expect(media.body).toBe('Briefing aprovado');
    expect(media.headers['cache-control']).toContain('no-store');
    expect(
      (
        await app.inject({
          url: path + `/messages/${requestId}/media`,
          headers: headers(other, ['vendedor']),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `/api/v1/whatsapp/sessions/${sessionId}/events` })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: path + '/messages', headers: headers(owner, ['admin']) })).json()
        .items,
    ).toHaveLength(2);
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const stream = await fetch(origin + `/api/v1/whatsapp/sessions/${sessionId}/events`, {
      headers: headers(owner, ['admin']),
      signal: controller.signal,
    });
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const reader = stream.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('changed');
    whatsapp.realtime.events.emit(sessionId);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('changed');
    await reader.cancel();
    controller.abort();
    await vi.waitFor(() => expect(whatsapp.realtime.events.listenerCount(sessionId)).toBe(0));
  } finally {
    await app.close();
    await database.pool.end();
    if (previous === undefined) delete process.env.CRM_UPLOAD_DIR;
    else process.env.CRM_UPLOAD_DIR = previous;
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
it('scopes inbox rows, counts unread, reopens closed chats and keeps the old payload', async () => {
  const database = await testDatabase();
  const team = randomUUID(),
    otherTeam = randomUUID(),
    owner = randomUUID(),
    teammate = randomUUID(),
    outsider = randomUUID(),
    admin = randomUUID();
  await database.pool.query(
    `INSERT INTO users(id,email,full_name,password_hash,team_id) VALUES
     ($1,'owner-inbox@example','Owner','hash',$5),
     ($2,'team-inbox@example','Team','hash',$5),
     ($3,'out-inbox@example','Out','hash',$6),
     ($4,'admin-inbox@example','Admin','hash',NULL)`,
    [owner, teammate, outsider, admin, team, otherTeam],
  );
  const { app, whatsapp } = await buildApiServer({
    testDatabase: database,
    whatsappTransport: { publish: async () => {}, close: async () => {} },
  });
  const headers = (
    id: string,
    roles: ('admin' | 'vendedor' | 'financeiro')[],
    teamId: string | null,
  ) => ({
    authorization: `Bearer ${signAccessToken({ id, email: id + '@test.example', fullName: 'Test', roles, teamId, totpEnabled: false })}`,
  });
  try {
    const sessionId = await (
      await whatsapp.store()
    ).connect(
      { id: owner, teamId: team, scope: 'own' },
      { provider: 'baileys', importHistory: false },
    );
    const inbound = (externalId: string, text: string, historical = false) =>
      whatsapp.processEvent({
        id: randomUUID(),
        sessionId,
        generation: 1,
        type: 'messages',
        messages: [
          {
            externalId,
            jid: '5541999999999@s.whatsapp.net',
            phone: '+5541999999999',
            name: 'Cliente Inbox',
            text,
            fromMe: false,
            historical,
            timestamp: new Date(Date.now() - 120000).toISOString(),
            type: 'text',
          },
        ],
      });
    await inbound('in-live', 'Preciso de um site');
    const leadId = (await database.pool.query('SELECT id FROM workspace_leads')).rows[0].id as string;
    const teammateLead = (
      await database.pool.query(
        `INSERT INTO workspace_leads(owner_id,name,company,phone) VALUES($1,'Equipe','Equipe Ltda','+5541888888888') RETURNING id`,
        [teammate],
      )
    ).rows[0].id as string;
    await database.pool.query(
      `INSERT INTO wa_messages(session_id,lead_id,external_id,jid,direction,actor_type,body,sent_at) VALUES($1,$2,'team-1','5541888888888@s.whatsapp.net','inbound','contact','Oi da equipe',now())`,
      [sessionId, teammateLead],
    );
    const list = (id: string, roles: ('admin' | 'vendedor' | 'financeiro')[], teamId: string | null, status = '') =>
      app.inject({
        url: `/api/v1/whatsapp/sessions/${sessionId}/conversations${status}`,
        headers: headers(id, roles, teamId),
      });
    const ownerItems = (await list(owner, ['vendedor'], team)).json().items;
    const teamItems = (await list(teammate, ['financeiro'], team)).json().items;
    const outsiderItems = (await list(outsider, ['vendedor'], otherTeam)).json().items;
    const adminItems = (await list(admin, ['admin'], null)).json().items;
    expect(ownerItems.map((item: { id: string }) => item.id)).toEqual([leadId]);
    expect(teamItems.map((item: { id: string }) => item.id).sort()).toEqual([leadId, teammateLead].sort());
    expect(outsiderItems).toEqual([]);
    expect(adminItems).toHaveLength(2);
    const item = ownerItems[0];
    for (const key of [
      'id',
      'conversation_id',
      'name',
      'company',
      'phone',
      'ai_enabled',
      'last_message',
      'last_at',
      'photoUrl',
    ])
      expect(item).toHaveProperty(key);
    expect(item).toMatchObject({
      status: 'open',
      last_direction: 'inbound',
      last_message_type: 'text',
      last_message: 'Preciso de um site',
      sla_goal_minutes: 30,
    });
    expect(Number(item.unread_count)).toBe(1);
    expect(item.pending_since).toBeTruthy();
    expect(item.last_inbound_at).toBeTruthy();
    const closed = await app.inject({
      method: 'PUT',
      url: `/api/v1/whatsapp/sessions/${sessionId}/leads/${leadId}/conversation`,
      headers: headers(owner, ['vendedor'], team),
      payload: { status: 'closed' },
    });
    expect(closed.statusCode, closed.body).toBe(200);
    expect((await list(owner, ['vendedor'], team, '?status=open')).json().items).toEqual([]);
    expect((await list(owner, ['vendedor'], team, '?status=closed')).json().items[0].status).toBe('closed');
    expect((await list(owner, ['vendedor'], team)).json().items[0].status).toBe('closed');
    await inbound('in-history', 'Mensagem antiga', true);
    expect((await list(owner, ['vendedor'], team)).json().items[0].status).toBe('closed');
    expect(Number((await list(owner, ['vendedor'], team)).json().items[0].unread_count)).toBe(1);
    await inbound('in-reopen', 'Voltei');
    const reopened = (await list(owner, ['vendedor'], team)).json().items[0];
    expect(reopened.status).toBe('open');
    expect(Number(reopened.unread_count)).toBe(2);
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/whatsapp/sessions/${sessionId}/leads/${leadId}/read`,
      headers: headers(outsider, ['vendedor'], otherTeam),
    });
    expect(denied.statusCode).toBe(404);
    const read = await app.inject({
      method: 'POST',
      url: `/api/v1/whatsapp/sessions/${sessionId}/leads/${leadId}/read`,
      headers: headers(teammate, ['financeiro'], team),
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(Number((await list(owner, ['vendedor'], team)).json().items[0].unread_count)).toBe(0);
    await database.pool.query(
      `INSERT INTO wa_messages(session_id,lead_id,external_id,jid,direction,actor_type,body,sent_at,delivery,historical) VALUES($1,$2,'human-1','5541999999999@s.whatsapp.net','outbound','human','Respondido',now(),'sent',false)`,
      [sessionId, leadId],
    );
    expect((await list(owner, ['vendedor'], team)).json().items[0].pending_since).toBeNull();
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const stream = await fetch(origin + `/api/v1/whatsapp/sessions/${sessionId}/events`, {
      headers: headers(admin, ['admin'], null),
    });
    const reader = stream.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.replace(/^data: /, '').trim())).toEqual({ type: 'changed' });
    await inbound('in-live-2', 'Nova mensagem ao vivo');
    const frame = new TextDecoder().decode((await reader.read()).value);
    const payload = JSON.parse(frame.replace(/^data: /, '').trim());
    expect(payload.type).toBe('changed');
    expect(payload.event).toBe('message:new');
    expect(payload.leadId).toBe(leadId);
    expect(payload.messageId).toEqual(expect.any(String));
    await reader.cancel();
  } finally {
    await app.close();
    await database.pool.end();
  }
}, 30000);

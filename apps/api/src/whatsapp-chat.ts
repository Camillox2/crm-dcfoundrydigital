import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { resolveGrantedScope, type WhatsAppEvent } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';
import { WhatsAppStore } from './whatsapp-store.js';
const uuid = z.string().uuid();
const mediaInput = z.object({
  leadId: uuid,
  name: z.string().min(1).max(180),
  mime: z
    .string()
    .max(150)
    .regex(
      /^(image\/(jpeg|png|webp)|audio\/[a-z0-9.+-]+|application\/[a-z0-9.+-]+|text\/(plain|csv))$/,
      'Use uma imagem, áudio ou documento com formato válido.',
    ),
  base64: z.string().min(4).max(22369624),
});
export function safeUploadKey(key: string) {
  if (!/^wa-[a-f0-9-]{36}$/.test(key)) throw new WorkspaceError(404, 'Arquivo indisponível.');
  return key;
}
export class WhatsAppRealtime {
  events = new EventEmitter();
  photos = new Map<string, { until: number; url: string | null }>();
  photoRequests = new Map<string, number>();
  connections = new Set<ServerResponse>();
  constructor() {
    this.events.setMaxListeners(100);
  }
  receive(event: WhatsAppEvent) {
    if (event.type === 'photo' && event.jid) {
      if (this.photos.size >= 200) this.photos.delete(this.photos.keys().next().value!);
      this.photos.set(`${event.sessionId}/${event.generation}/${event.jid}`, {
        until: Date.now() + 300000,
        url:
          event.photoUrl && /^https:\/\/[^/]+\.whatsapp\.net\//.test(event.photoUrl)
            ? event.photoUrl
            : null,
      });
    }
    this.events.emit(event.sessionId);
  }
}
export async function registerWhatsAppChat(
  app: FastifyInstance,
  repo: () => Promise<WhatsAppStore>,
  flush: () => Promise<void>,
  realtime: WhatsAppRealtime,
) {
  app.addHook('preClose', async () => {
    for (const response of realtime.connections) response.end();
  });
  const params = z.object({ id: uuid, leadId: uuid });
  const access = async (req: FastifyRequest, action: 'read' | 'create') => {
    const input = params.parse(req.params),
      user = req.authUser!;
    const waScope = resolveGrantedScope(user.roles, `whatsapp:${action}`),
      leadScope =
        resolveGrantedScope(user.roles, 'lead:read') ??
        resolveGrantedScope(user.roles, 'contact:read');
    if (!waScope || !leadScope)
      throw new WorkspaceError(403, 'Seu perfil não pode abrir esta conversa.');
    const store = await repo();
    const lead = (
      await store.pool.query(
        `SELECT l.* FROM workspace_leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND l.archived_at IS NULL AND ($2::boolean OR l.owner_id=$3::uuid OR ($4::boolean AND u.team_id=$5::uuid)) AND ($6::boolean OR l.owner_id=$3::uuid OR ($7::boolean AND u.team_id=$5::uuid))`,
        [
          input.leadId,
          waScope === 'all',
          user.id,
          waScope === 'team',
          user.teamId ?? null,
          leadScope === 'all',
          leadScope === 'team',
        ],
      )
    ).rows[0];
    const session = (await store.pool.query('SELECT * FROM wa_sessions WHERE id=$1', [input.id]))
      .rows[0];
    if (!lead || !session) throw new WorkspaceError(404, 'Conversa indisponível.');
    const identity = (
      await store.pool.query(
        'SELECT jid FROM wa_identities WHERE session_id=$1 AND lead_id=$2 ORDER BY created_at DESC LIMIT 1',
        [input.id, input.leadId],
      )
    ).rows[0];
    const jid =
      identity?.jid ??
      (/^\+[1-9]\d{7,14}$/.test(lead.phone) ? lead.phone.slice(1) + '@s.whatsapp.net' : null);
    return { store, lead, session, jid, input };
  };
  app.get(
    '/api/v1/whatsapp/sessions/:id/leads/:leadId/messages',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req) => {
      const { store, input } = await access(req, 'read');
      const q = z.object({ before: z.string().datetime().optional() }).parse(req.query);
      return {
        items: (
          await store.pool.query(
            `SELECT id,body,message_type,direction,actor_type,delivery,external_id,sent_at,media_key IS NOT NULL AS has_media,mime_type,file_name,media_bytes,historical FROM wa_messages WHERE session_id=$1 AND lead_id=$2 AND ($3::timestamptz IS NULL OR sent_at<$3) ORDER BY sent_at DESC,id DESC LIMIT 100`,
            [input.id, input.leadId, q.before ?? null],
          )
        ).rows.reverse(),
      };
    },
  );
  app.post(
    '/api/v1/whatsapp/sessions/:id/leads/:leadId/messages',
    { preHandler: [requirePermission('whatsapp:create')] },
    async (req, reply) => {
      const { store, input, session, jid } = await access(req, 'create');
      if (
        session.provider !== 'baileys' ||
        session.status !== 'connected' ||
        !session.enabled ||
        !jid
      )
        throw new WorkspaceError(409, 'Conecte o WhatsApp antes de enviar.');
      const body = z
        .object({
          text: z.string().trim().max(10000).default(''),
          mediaId: uuid.optional(),
          requestId: uuid,
        })
        .refine((v) => v.text || v.mediaId, 'Escreva uma mensagem ou anexe um arquivo.')
        .parse(req.body);
      const media = body.mediaId
        ? (
            await store.pool.query(
              'SELECT * FROM wa_media_uploads WHERE id=$1 AND lead_id=$2 AND owner_id=$3',
              [body.mediaId, input.leadId, req.authUser!.id],
            )
          ).rows[0]
        : undefined;
      if (body.mediaId && !media) throw new WorkspaceError(404, 'Anexo indisponível.');
      const client = await store.pool.connect();
      try {
        await client.query('BEGIN');
        const found = (
          await client.query('SELECT session_id,lead_id,actor_id FROM wa_messages WHERE id=$1', [
            body.requestId,
          ])
        ).rows[0];
        if (
          found &&
          (found.session_id !== input.id ||
            found.lead_id !== input.leadId ||
            found.actor_id !== req.authUser!.id)
        )
          throw new WorkspaceError(409, 'Identificador de envio já utilizado.');
        await client.query(
          `INSERT INTO wa_messages(id,session_id,lead_id,external_id,jid,direction,actor_type,actor_id,body,historical,sent_at,message_type,delivery,media_key,mime_type,file_name,media_bytes) VALUES($1,$2,$3,$4,$5,'outbound','human',$6,$7,false,now(),$8,'queued',$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING`,
          [
            body.requestId,
            input.id,
            input.leadId,
            body.requestId.replaceAll('-', '').toUpperCase(),
            jid,
            req.authUser!.id,
            body.text,
            media?.media_type ?? 'text',
            media?.storage_key ?? null,
            media?.mime_type ?? null,
            media?.file_name ?? null,
            media?.bytes ?? null,
          ],
        );
        await client.query(
          `INSERT INTO wa_commands(id,session_id,generation,command_type,message_id,jid,body,media_key,mime_type,file_name,media_type) VALUES($1,$2,$3,'send',$1,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [
            body.requestId,
            input.id,
            session.generation,
            jid,
            body.text,
            media?.storage_key ?? null,
            media?.mime_type ?? null,
            media?.file_name ?? null,
            media?.media_type ?? null,
          ],
        );
        if (!found)
          await client.query(
            `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'whatsapp.send_queued','wa_message',$2,'{}')`,
            [req.authUser!.id, body.requestId],
          );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      await flush().catch(() => undefined);
      realtime.events.emit(input.id);
      return reply.status(202).send({ id: body.requestId, delivery: 'queued' });
    },
  );
  app.post(
    '/api/v1/whatsapp/sessions/:id/leads/:leadId/media',
    { preHandler: [requirePermission('whatsapp:create')], bodyLimit: 24 * 1024 * 1024 },
    async (req, reply) => {
      const { store, input } = await access(req, 'create'),
        body = mediaInput.parse({ ...(req.body as object), leadId: input.leadId });
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64))
        throw new WorkspaceError(400, 'Arquivo inválido.');
      const bytes = Buffer.from(body.base64, 'base64');
      if (!bytes.length || bytes.length > 16777216)
        throw new WorkspaceError(400, 'O limite é 16 MB.');
      const key = 'wa-' + randomUUID(),
        directory = process.env.CRM_UPLOAD_DIR || '/data/uploads';
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, key), bytes, { mode: 0o600, flag: 'wx' });
      const type = body.mime.startsWith('image/')
        ? 'image'
        : body.mime.startsWith('audio/')
          ? 'audio'
          : 'file';
      const r = await store.pool.query(
        'INSERT INTO wa_media_uploads(lead_id,owner_id,storage_key,mime_type,file_name,media_type,bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [
          input.leadId,
          req.authUser!.id,
          key,
          body.mime,
          body.name.replace(/[\r\n"\\/]/g, '_'),
          type,
          bytes.length,
        ],
      );
      return reply.status(201).send(r.rows[0]);
    },
  );
  app.get(
    '/api/v1/whatsapp/sessions/:id/leads/:leadId/messages/:messageId/media',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req, reply) => {
      const { store, input } = await access(req, 'read'),
        id = uuid.parse((req.params as { messageId: string }).messageId);
      const row = (
        await store.pool.query(
          'SELECT * FROM wa_messages WHERE id=$1 AND session_id=$2 AND lead_id=$3',
          [id, input.id, input.leadId],
        )
      ).rows[0];
      if (!row?.media_key)
        throw new WorkspaceError(404, 'Mídia não recebida ou expirada no provedor.');
      const bytes = await readFile(
        join(process.env.CRM_UPLOAD_DIR || '/data/uploads', safeUploadKey(row.media_key)),
      ).catch(() => null);
      if (!bytes) throw new WorkspaceError(404, 'Arquivo indisponível.');
      const inline = /^(image\/(png|jpeg|webp)|audio\/(ogg|mpeg|wav|mp4))$/.test(
        row.mime_type ?? '',
      );
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.file_name || 'arquivo')}`,
        )
        .type(inline ? row.mime_type : 'application/octet-stream')
        .send(bytes);
    },
  );
  app.get(
    '/api/v1/whatsapp/sessions/:id/leads/:leadId/photo',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req) => {
      const { store, input, session, jid } = await access(req, 'read');
      if (session.provider !== 'baileys' || session.status !== 'connected' || !jid)
        return { url: null };
      const key = `${input.id}/${session.generation}/${jid}`,
        cached = realtime.photos.get(key);
      if (cached && cached.until > Date.now()) return { url: cached.url };
      if ((realtime.photoRequests.get(key) ?? 0) < Date.now()) {
        if (realtime.photoRequests.size >= 200) realtime.photoRequests.clear();
        realtime.photoRequests.set(key, Date.now() + 30000);
        await store.pool.query(
          `INSERT INTO wa_commands(session_id,generation,command_type,jid) VALUES($1,$2,'photo',$3)`,
          [input.id, session.generation, jid],
        );
        await flush().catch(() => undefined);
      }
      return { url: null, pending: true };
    },
  );
  app.get(
    '/api/v1/whatsapp/sessions/:id/events',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req, reply) => {
      const id = uuid.parse((req.params as { id: string }).id),
        store = await repo();
      if (!(await store.pool.query('SELECT id FROM wa_sessions WHERE id=$1', [id])).rows.length)
        throw new WorkspaceError(404, 'Sessão indisponível.');
      if (realtime.events.listenerCount(id) >= 50)
        throw new WorkspaceError(429, 'Há muitas janelas abertas.');
      reply.hijack();
      realtime.connections.add(reply.raw);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const changed = () => {
        if (!reply.raw.destroyed) reply.raw.write('data: {"type":"changed"}\n\n');
      };
      changed();
      realtime.events.on(id, changed);
      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
      }, 20000);
      const expires = setTimeout(() => reply.raw.end(), 14 * 60000);
      reply.raw.on('close', () => {
        realtime.connections.delete(reply.raw);
        clearInterval(heartbeat);
        clearTimeout(expires);
        realtime.events.off(id, changed);
      });
    },
  );
}

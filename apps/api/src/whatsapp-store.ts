import {
  normalizePhoneE164,
  directIdentity,
  canonicalWhatsAppStatus,
  type WhatsAppCommand,
  type WhatsAppEvent,
} from '@dcfoundry/shared';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type { WorkspaceActor } from './workspace-store.js';
import { WorkspaceError } from './module-store.js';
type Pool = DatabaseConnectionResult['pool'];
const allowed = `(s.owner_id=$2::uuid OR $3::boolean OR ($4::boolean AND s.owner_id IN (SELECT id FROM users WHERE team_id=$5::uuid)))`;
const args = (id: string, a: WorkspaceActor) => [
  id,
  a.id,
  a.scope === 'all',
  a.scope === 'team',
  a.teamId,
];
export class WhatsAppStore {
  constructor(public pool: Pool) {}
  async session(id: string, actor: WorkspaceActor) {
    const r = await this.pool.query(
      `SELECT s.* FROM wa_sessions s WHERE s.id=$1 AND ${allowed}`,
      args(id, actor),
    );
    if (!r.rows[0]) throw new WorkspaceError(404, 'Sessão não encontrada ou sem permissão.');
    const row = r.rows[0];
    return {
      ...row,
      status: canonicalWhatsAppStatus(row.provider, row.status),
      qr:
        row.credentials_expires_at && new Date(row.credentials_expires_at).getTime() > Date.now()
          ? row.qr
          : null,
      pairing_code:
        row.credentials_expires_at && new Date(row.credentials_expires_at).getTime() > Date.now()
          ? row.pairing_code
          : null,
    };
  }
  async list(actor: WorkspaceActor) {
    return (
      await this.pool.query(
        `SELECT s.id FROM wa_sessions s WHERE ${allowed.replaceAll('$2', '$1').replaceAll('$3', '$2').replaceAll('$4', '$3').replaceAll('$5', '$4')} ORDER BY s.created_at LIMIT 10`,
        [actor.id, actor.scope === 'all', actor.scope === 'team', actor.teamId],
      )
    ).rows.map((r) => r.id as string);
  }
  async connect(
    actor: WorkspaceActor,
    input: { provider: 'baileys' | 'meta'; phone?: string; importHistory: boolean },
    id?: string,
  ) {
    if (id) await this.session(id, actor);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(78431022)');
      if (
        Number(
          (
            await client.query(
              'SELECT count(*) AS total FROM wa_sessions WHERE enabled=true AND ($1::uuid IS NULL OR id<>$1)',
              [id ?? null],
            )
          ).rows[0].total,
        ) >= Number(process.env.WHATSAPP_MAX_SESSIONS || 1)
      )
        throw new WorkspaceError(
          409,
          'Já existe uma sessão ativa. Reutilize-a ou desconecte antes de criar outra.',
        );
      const r = id
        ? await client.query(
            `UPDATE wa_sessions SET provider=$2,status='disconnected',generation=generation+1,phone=$3,qr=NULL,pairing_code=NULL,credentials_expires_at=NULL,import_history=$4,enabled=true,updated_at=now() WHERE id=$1 RETURNING *`,
            [id, input.provider, input.phone ?? null, input.importHistory],
          )
        : await client.query(
            `INSERT INTO wa_sessions(owner_id,provider,phone,import_history) VALUES($1,$2,$3,$4) RETURNING *`,
            [actor.id, input.provider, input.phone ?? null, input.importHistory],
          );
      const session = r.rows[0];
      await client.query(
        `INSERT INTO wa_commands(session_id,generation,command_type,phone) VALUES($1,$2,'connect',$3)`,
        [session.id, session.generation, input.phone ?? null],
      );
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'whatsapp.connect','wa_session',$2,$3)`,
        [
          actor.id,
          session.id,
          JSON.stringify({ provider: input.provider, generation: session.generation }),
        ],
      );
      await client.query('COMMIT');
      return session.id as string;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async command(id: string, type: 'disconnect' | 'sync', actor: WorkspaceActor) {
    const session = await this.session(id, actor);
    const anchor =
      type === 'sync'
        ? (
            await this.pool.query(
              'SELECT external_id,direction,sent_at,jid FROM wa_messages WHERE session_id=$1 ORDER BY sent_at ASC LIMIT 1',
              [id],
            )
          ).rows[0]
        : null;
    if (type === 'sync' && !anchor)
      throw new WorkspaceError(
        409,
        'O histórico inicial chega após parear. Aguarde a primeira conversa antes de pedir mensagens anteriores.',
      );
    await this.pool.query(
      `INSERT INTO wa_commands(session_id,generation,command_type,jid,anchor_id,anchor_from_me,anchor_timestamp) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        session.generation,
        type,
        anchor?.jid ?? null,
        anchor?.external_id ?? null,
        anchor?.direction === 'outbound',
        anchor ? Math.floor(new Date(anchor.sent_at).getTime() / 1000) : null,
      ],
    );
    if (type === 'disconnect')
      await this.pool.query(
        `UPDATE wa_sessions SET enabled=false,status='disconnected',qr=NULL,pairing_code=NULL,credentials_expires_at=NULL,updated_at=now() WHERE id=$1`,
        [id],
      );
  }
  async pending(): Promise<WhatsAppCommand[]> {
    const r = await this.pool.query(
      `SELECT c.*,s.provider,s.import_history FROM wa_commands c JOIN wa_sessions s ON s.id=c.session_id WHERE c.published_at IS NULL ORDER BY c.created_at LIMIT 30`,
    );
    return r.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      generation: row.generation,
      type: row.command_type,
      provider: row.provider,
      phone: row.phone ?? undefined,
      importHistory: row.import_history,
      messageId: row.message_id ?? undefined,
      jid: row.jid ?? undefined,
      text: row.body ?? undefined,
      anchor: row.anchor_id
        ? { id: row.anchor_id, fromMe: row.anchor_from_me, timestamp: Number(row.anchor_timestamp) }
        : undefined,
    }));
  }
  async ingest(event: WhatsAppEvent) {
    const client = await this.pool.connect();
    const created: string[] = [];
    try {
      await client.query('BEGIN');
      const receipt = await client.query(
        'INSERT INTO wa_event_receipts(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
        [event.id],
      );
      if (!receipt.rows.length) {
        await client.query('COMMIT');
        return created;
      }
      const session = (
        await client.query('SELECT * FROM wa_sessions WHERE id=$1 FOR UPDATE', [event.sessionId])
      ).rows[0];
      if (
        !session ||
        session.generation !== event.generation ||
        (!session.enabled && event.status !== 'disconnected')
      ) {
        await client.query('COMMIT');
        return created;
      }
      if (event.type === 'status')
        await client.query(
          `UPDATE wa_sessions SET status=$2,qr=$3,pairing_code=$4,credentials_expires_at=CASE WHEN $3::text IS NOT NULL OR $4::text IS NOT NULL THEN now()+interval '60 seconds' ELSE NULL END,phone=COALESCE($5,phone),heartbeat_at=now(),updated_at=now() WHERE id=$1`,
          [
            event.sessionId,
            canonicalWhatsAppStatus(session.provider, event.status ?? 'disconnected'),
            event.qr ?? null,
            event.pairingCode ?? null,
            event.phone ?? null,
          ],
        );
      if (event.type === 'history')
        await client.query(
          'UPDATE wa_sessions SET history_progress=$2,heartbeat_at=now(),updated_at=now() WHERE id=$1',
          [event.sessionId, Math.round(event.historyProgress ?? 0)],
        );
      for (const m of event.messages ?? []) {
        const identity = directIdentity(
          m.jid,
          m.phone ? m.phone.replace('+', '') + '@s.whatsapp.net' : null,
        );
        if (!identity) continue;
        const phone = identity.phone ? normalizePhoneE164(identity.phone) : null;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone ?? identity.jid]);
        let lead = (
          await client.query(
            `SELECT l.id FROM workspace_leads l WHERE l.archived_at IS NULL AND (l.id IN (SELECT lead_id FROM wa_identities WHERE session_id=$1 AND jid=$2) OR ($3::text IS NOT NULL AND l.phone=$3)) AND (l.owner_id=$4 OR l.owner_id IN (SELECT u.id FROM users u JOIN users owner ON owner.id=$4 WHERE owner.team_id IS NOT NULL AND u.team_id=owner.team_id)) ORDER BY l.created_at LIMIT 1`,
            [session.id, identity.jid, phone, session.owner_id],
          )
        ).rows[0];
        if (!lead) {
          if (!phone || (m.historical && !session.import_history)) continue;
          lead = (
            await client.query(
              `INSERT INTO workspace_leads(owner_id,name,company,phone,notes) VALUES($1,$2,$2,$3,'Contato recebido pelo WhatsApp.') RETURNING id`,
              [session.owner_id, m.name, phone],
            )
          ).rows[0];
          created.push(lead.id);
          await client.query(
            `INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('system','lead.whatsapp_created','lead',$1,$2)`,
            [lead.id, JSON.stringify({ sessionId: session.id })],
          );
        }
        await client.query(
          `INSERT INTO wa_identities(session_id,lead_id,jid,phone_e164) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,jid) DO UPDATE SET phone_e164=COALESCE(EXCLUDED.phone_e164,wa_identities.phone_e164)`,
          [session.id, lead.id, identity.jid, phone],
        );
        await client.query(
          `INSERT INTO wa_messages(session_id,lead_id,external_id,jid,direction,actor_type,body,historical,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(session_id,jid,external_id) DO NOTHING`,
          [
            session.id,
            lead.id,
            m.externalId,
            identity.jid,
            m.fromMe ? 'outbound' : 'inbound',
            m.fromMe ? 'human' : 'contact',
            m.text,
            m.historical,
            m.timestamp,
          ],
        );
      }
      await client.query('COMMIT');
      return created;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

import { randomUUID } from 'node:crypto';
import type { CrmPool } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
import { evaluateFoundry, type FoundryGenerate } from './foundry-engine.js';
import { bookFoundryMeeting } from './calendar.js';
export class WebsiteChat {
  constructor(
    public pool: CrmPool,
    public generate?: FoundryGenerate,
  ) {}
  async messages(sessionId: string) {
    return (
      await this.pool.query(
        'SELECT id,role,body,created_at FROM website_chat_messages WHERE session_id=$1 ORDER BY created_at,id LIMIT 200',
        [sessionId],
      )
    ).rows;
  }
  async receive(session: any, id: string, body: string) {
    const c = await this.pool.connect();
    let incoming: any, lead: any;
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['web-chat:' + session.id]);
      lead = (
        await c.query(
          'SELECT * FROM workspace_leads WHERE id=$1 AND archived_at IS NULL FOR UPDATE',
          [session.lead_id],
        )
      ).rows[0];
      if (!lead) throw new WorkspaceError(404, 'Conversa indisponível.');
      const duplicate = (
        await c.query(
          'SELECT id FROM website_chat_messages WHERE session_id=$1 AND request_key=$2',
          [session.id, id],
        )
      ).rows[0];
      if (duplicate) {
        await c.query('COMMIT');
        return;
      }
      const size = Number(
        (
          await c.query('SELECT count(*) AS n FROM website_chat_messages WHERE session_id=$1', [
            session.id,
          ])
        ).rows[0].n,
      );
      if (size >= 190)
        throw new WorkspaceError(409, 'Esta conversa atingiu o limite. Inicie outra conversa.');
      if (
        (
          await c.query(
            "SELECT id FROM website_chat_messages WHERE session_id=$1 AND role='contact' AND turn_state='pending' LIMIT 1",
            [session.id],
          )
        ).rows.length
      )
        throw new WorkspaceError(409, 'A Foundry ainda está respondendo. Aguarde um instante.');
      incoming = (
        await c.query(
          "INSERT INTO website_chat_messages(session_id,lead_id,role,body,request_key,turn_state) VALUES($1,$2,'contact',$3,$4,$5) RETURNING id",
          [session.id, session.lead_id, body, id, lead.ai_paused ? 'completed' : 'pending'],
        )
      ).rows[0];
      await c.query('UPDATE website_chat_sessions SET last_message_at=now() WHERE id=$1', [
        session.id,
      ]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    if (lead.ai_paused) return;
    const enabled = (
      await this.pool.query('SELECT website_enabled FROM foundry_settings WHERE singleton=true')
    ).rows[0]?.website_enabled;
    let result: Awaited<ReturnType<typeof evaluateFoundry>>;
    try {
      result = enabled
        ? await evaluateFoundry(
            this.pool,
            body,
            this.generate,
            JSON.stringify({
              projectType: lead.project_type,
              objective: lead.objective,
              budgetCents: lead.budget_cents,
              deadline: lead.deadline_text,
              decisionMaker: lead.decision_maker,
              urgency: lead.urgency,
            }),
          )
        : {
            answer: 'Sua mensagem foi registrada. Vou encaminhar para uma pessoa da equipe.',
            handoff: true,
            facts: {},
            model: 'policy',
          };
    } catch {
      result = {
        answer: 'Vou encaminhar sua mensagem para a equipe confirmar as informações com você.',
        handoff: true,
        facts: {},
        model: 'provider_unavailable',
      };
    }
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const current = (
        await tx.query('SELECT * FROM workspace_leads WHERE id=$1 FOR UPDATE', [lead.id])
      ).rows[0];
      if (
        !current ||
        current.archived_at ||
        current.ai_paused ||
        current.ai_control_revision !== lead.ai_control_revision
      ) {
        await tx.query("UPDATE website_chat_messages SET turn_state='cancelled' WHERE id=$1", [
          incoming.id,
        ]);
        await tx.query('COMMIT');
        return;
      }
      if (!result.handoff && 'meetingRequest' in result && result.meetingRequest) {
        const booking = await bookFoundryMeeting(
          tx,
          lead,
          result.meetingRequest,
          body,
          'website:' + incoming.id,
        );
        result = { ...result, answer: booking.answer, handoff: booking.handoff ?? false };
      }
      const f = result.facts;
      await tx.query(
        "UPDATE workspace_leads SET project_type=COALESCE($2,project_type),objective=COALESCE($3,objective),budget_cents=COALESCE($4,budget_cents),deadline_text=COALESCE($5,deadline_text),decision_maker=COALESCE($6,decision_maker),urgency=COALESCE($7,urgency),ai_paused=$8,ai_control_revision=ai_control_revision+CASE WHEN $8 THEN 1 ELSE 0 END,handoff_reason=CASE WHEN $8 THEN 'Atendimento humano solicitado no site' ELSE handoff_reason END,updated_at=now() WHERE id=$1",
        [
          lead.id,
          f.projectType ?? null,
          f.objective ?? null,
          f.budgetCents ?? null,
          f.deadline ?? null,
          f.decisionMaker ?? null,
          f.urgency ?? null,
          result.handoff,
        ],
      );
      await tx.query(
        "INSERT INTO website_chat_messages(session_id,lead_id,role,body,reply_to_id,model) VALUES($1,$2,'foundry',$3,$4,$5) ON CONFLICT(reply_to_id) DO NOTHING",
        [session.id, lead.id, result.answer, incoming.id, result.model],
      );
      await tx.query("UPDATE website_chat_messages SET turn_state='completed' WHERE id=$1", [
        incoming.id,
      ]);
      await tx.query(
        "INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('ai_agent','website_chat.reply','lead',$1,$2)",
        [
          lead.id,
          JSON.stringify({
            messageId: incoming.id,
            model: result.model,
            handoff: result.handoff,
            facts: f,
          }),
        ],
      );
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }
  }
}

import { randomUUID } from 'node:crypto';
import {
  FOUNDRY_POLICY,
  FOUNDRY_JSON,
  parseFoundryTurn,
  wantsHuman,
  type FoundryFacts,
} from '@dcfoundry/ai';
import type { WhatsAppEvent } from '@dcfoundry/shared';
import type { CrmPool } from './agency-access.js';
import { askGemini } from './assistant-provider.js';
export type FoundryGenerate = (
  message: string,
  context: string,
) => Promise<{ answer: string; model: string }>;
export async function loadFoundryContext(
  pool: CrmPool,
  channel: 'internal' | 'customer' = 'customer',
) {
  const [knowledge, guidance] = await Promise.all([
    pool.query(
      `SELECT title,content FROM foundry_knowledge WHERE archived_at IS NULL AND ($1::boolean OR audience='public') ORDER BY updated_at DESC LIMIT 100`,
      [channel === 'internal'],
    ),
    pool.query(
      'SELECT title,instructions,tone FROM foundry_guidance WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 10',
    ),
  ]);
  const knowledgeText = knowledge.rows
    .map((row) => `${row.title}: ${row.content}`)
    .join('\n')
    .slice(0, 18000);
  const instructions = guidance.rows
    .map((row) => `${row.title} (${row.tone}): ${row.instructions}`)
    .join('\n')
    .slice(0, 4000);
  return {
    knowledge: knowledgeText,
    context: `${FOUNDRY_POLICY}\nOrientações compartilhadas da equipe:\n${instructions}\nBase factual:\n${knowledgeText}`,
  };
}
export async function evaluateFoundry(
  pool: CrmPool,
  message: string,
  generate: FoundryGenerate = askGemini,
  known = '',
) {
  const source = await loadFoundryContext(pool);
  if (wantsHuman(message))
    return { ...parseFoundryTurn('', message, source.knowledge), model: 'policy' };
  const generated = await generate(
    message,
    `${FOUNDRY_POLICY}\n${FOUNDRY_JSON}\n${source.context}\nFatos anteriores confirmados (não substitua sem evidência): ${known}`,
  );
  return {
    ...parseFoundryTurn(generated.answer, message, source.knowledge),
    model: generated.model,
  };
}
export class FoundryEngine {
  constructor(
    public pool: CrmPool,
    public flush: () => Promise<void>,
    public generate: FoundryGenerate = askGemini,
  ) {}
  async receive(event: WhatsAppEvent) {
    if (event.type !== 'messages') return;
    if (
      !(await this.pool.query('SELECT whatsapp_enabled FROM foundry_settings WHERE singleton=true'))
        .rows[0]?.whatsapp_enabled
    )
      return;
    for (const raw of event.messages ?? []) {
      if (raw.fromMe || raw.historical) continue;
      const row = (
        await this.pool.query(
          `SELECT m.id AS message_id,l.* FROM wa_messages m JOIN workspace_leads l ON l.id=m.lead_id JOIN wa_sessions s ON s.id=m.session_id WHERE m.session_id=$1 AND m.jid=$2 AND m.external_id=$3 AND m.direction='inbound' AND m.historical=false AND s.generation=$4 AND s.provider='baileys' AND s.status='connected' AND s.enabled=true AND l.archived_at IS NULL AND l.ai_paused=false`,
          [event.sessionId, raw.jid, raw.externalId, event.generation],
        )
      ).rows[0];
      if (!row) continue;
      const claim = await this.pool.query(
        `INSERT INTO foundry_turns(message_id,lead_id,control_revision) VALUES($1,$2,$3) ON CONFLICT(message_id) DO NOTHING RETURNING id`,
        [row.message_id, row.id, row.ai_control_revision],
      );
      if (!claim.rows.length) continue;
      const turnId = claim.rows[0].id;
      let result: Awaited<ReturnType<typeof evaluateFoundry>>;
      try {
        result =
          raw.type === 'text'
            ? await evaluateFoundry(
                this.pool,
                raw.text,
                this.generate,
                JSON.stringify({
                  projectType: row.project_type,
                  objective: row.objective,
                  budgetCents: row.budget_cents,
                  deadline: row.deadline_text,
                  decisionMaker: row.decision_maker,
                  urgency: row.urgency,
                }),
              )
            : {
                answer:
                  'Recebi sua mensagem. Vou chamar alguém da equipe para analisar esse material com você.',
                handoff: true,
                facts: {},
                model: 'policy',
              };
      } catch {
        result = {
          answer: 'Vou encaminhar sua conversa para a equipe confirmar os próximos passos.',
          handoff: true,
          facts: {},
          model: 'provider_unavailable',
        };
      }
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const current = (
          await client.query(
            'SELECT ai_paused,ai_control_revision,archived_at FROM workspace_leads WHERE id=$1 FOR UPDATE',
            [row.id],
          )
        ).rows[0];
        if (
          !current ||
          current.ai_paused ||
          current.archived_at ||
          current.ai_control_revision !== row.ai_control_revision
        ) {
          await client.query(
            "UPDATE foundry_turns SET state='cancelled',completed_at=now() WHERE id=$1",
            [turnId],
          );
          await client.query('COMMIT');
          continue;
        }
        const f: FoundryFacts = result.facts,
          revision = row.ai_control_revision + (result.handoff ? 1 : 0);
        await client.query(
          `UPDATE workspace_leads SET project_type=COALESCE($2,project_type),objective=COALESCE($3,objective),budget_cents=COALESCE($4,budget_cents),deadline_text=COALESCE($5,deadline_text),decision_maker=COALESCE($6,decision_maker),urgency=COALESCE($7,urgency),ai_paused=$8,ai_control_revision=$9,handoff_reason=CASE WHEN $8 THEN 'Solicitação de atendimento humano ou informação não confirmada' ELSE handoff_reason END,updated_at=now() WHERE id=$1`,
          [
            row.id,
            f.projectType ?? null,
            f.objective ?? null,
            f.budgetCents ?? null,
            f.deadline ?? null,
            f.decisionMaker ?? null,
            f.urgency ?? null,
            result.handoff,
            revision,
          ],
        );
        const messageId = randomUUID();
        await client.query(
          `INSERT INTO wa_messages(id,session_id,lead_id,external_id,jid,direction,actor_type,body,historical,sent_at,delivery) VALUES($1,$2,$3,$4,$5,'outbound','foundry',$6,false,now(),'queued')`,
          [
            messageId,
            event.sessionId,
            row.id,
            messageId.replaceAll('-', '').toUpperCase(),
            raw.jid,
            result.answer,
          ],
        );
        await client.query(
          `INSERT INTO wa_commands(id,session_id,generation,command_type,message_id,jid,body,lead_id,ai_revision,handoff_ack) VALUES($1,$2,$3,'send',$1,$4,$5,$6,$7,$8)`,
          [
            messageId,
            event.sessionId,
            event.generation,
            raw.jid,
            result.answer,
            row.id,
            revision,
            result.handoff,
          ],
        );
        await client.query(
          `UPDATE foundry_turns SET state='queued',answer=$2,model=$3,handoff=$4,completed_at=now() WHERE id=$1`,
          [turnId, result.answer, result.model, result.handoff],
        );
        await client.query(
          `INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('ai_agent','foundry.qualified','lead',$1,$2)`,
          [row.id, JSON.stringify({ facts: f, handoff: result.handoff, model: result.model })],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      await this.flush();
    }
  }
}

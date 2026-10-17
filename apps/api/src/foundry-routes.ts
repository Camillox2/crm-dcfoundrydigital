import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { FOUNDRY_SCENARIOS, FOUNDRY_POLICY } from '@dcfoundry/ai';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';
import { scopedLead } from './agency-access.js';
import {
  FoundryEngine,
  evaluateFoundry,
  loadFoundryContext,
  type FoundryGenerate,
} from './foundry-engine.js';
import type { registerWhatsAppRoutes } from './whatsapp-routes.js';
import { changeFoundryControl } from './foundry-control.js';
import { trackedGemini } from './ai-usage.js';
type Database = () => Promise<DatabaseConnectionResult> | null;
export async function registerFoundryRoutes(
  app: FastifyInstance,
  database: Database,
  whatsapp: Awaited<ReturnType<typeof registerWhatsAppRoutes>>,
  generate?: FoundryGenerate,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  whatsapp.setAgent(async (event) => {
    const connection = await pool();
    await new FoundryEngine(connection, whatsapp.flush, generate).receive(event);
  });
  app.get(
    '/api/v1/foundry/settings',
    { preHandler: [requirePermission('ai_agent:read')] },
    async () => ({
      item: (
        await (
          await pool()
        ).query(
          'SELECT whatsapp_enabled,website_enabled,version,updated_at FROM foundry_settings WHERE singleton=true',
        )
      ).rows[0],
    }),
  );
  app.put(
    '/api/v1/foundry/settings',
    { preHandler: [requirePermission('ai_agent:update')] },
    async (req) => {
      const input = z
          .object({
            whatsappEnabled: z.boolean(),
            websiteEnabled: z.boolean().optional(),
            version: z.number().int().positive(),
          })
          .parse(req.body),
        db = await pool();
      if (
        (input.whatsappEnabled || input.websiteEnabled) &&
        !generate &&
        !process.env.GEMINI_API_KEY
      )
        throw new WorkspaceError(
          503,
          'Configure GEMINI_API_KEY no servidor antes de ativar a Foundry.',
        );
      const r = await db.query(
        'UPDATE foundry_settings SET whatsapp_enabled=$1,website_enabled=COALESCE($4,website_enabled),version=version+1,updated_by=$2,updated_at=now() WHERE singleton=true AND version=$3 RETURNING *',
        [input.whatsappEnabled, req.authUser!.id, input.version, input.websiteEnabled ?? null],
      );
      if (!r.rows.length)
        throw new WorkspaceError(409, 'As configurações mudaram. Atualize antes de salvar.');
      await db.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'foundry.settings','foundry','shared',$2)`,
        [
          req.authUser!.id,
          JSON.stringify({
            enabled: input.whatsappEnabled,
            websiteEnabled: r.rows[0].website_enabled,
            version: r.rows[0].version,
          }),
        ],
      );
      await whatsapp.setAgentEnabled(input.whatsappEnabled);
      return { item: r.rows[0] };
    },
  );
  app.get(
    '/api/v1/leads/:id/foundry',
    { preHandler: [requirePermission('lead:read')] },
    async (req) => {
      const lead = await scopedLead(
        await pool(),
        req,
        z
          .string()
          .uuid()
          .parse((req.params as { id: string }).id),
      );
      return {
        paused: lead.ai_paused,
        revision: lead.ai_control_revision,
        reason: lead.handoff_reason,
        facts: {
          projectType: lead.project_type,
          objective: lead.objective,
          budgetCents: lead.budget_cents,
          deadline: lead.deadline_text,
          decisionMaker: lead.decision_maker,
          urgency: lead.urgency,
        },
        summary: lead.ai_summary,
      };
    },
  );
  app.put(
    '/api/v1/leads/:id/foundry',
    { preHandler: [requirePermission('lead:update')] },
    async (req) => {
      const db = await pool(),
        id = z
          .string()
          .uuid()
          .parse((req.params as { id: string }).id),
        input = z
          .object({ paused: z.boolean(), revision: z.number().int().positive() })
          .parse(req.body);
      await scopedLead(db, req, id, 'lead:update');
      const state = await changeFoundryControl(
        db,
        id,
        input.paused,
        input.revision,
        req.authUser!.id,
      );
      await whatsapp.syncControl(id);
      return state;
    },
  );
  app.post(
    '/api/v1/leads/:id/ai-summary',
    { preHandler: [requirePermission('lead:read')] },
    async (req) => {
      const db = await pool(),
        lead = await scopedLead(
          db,
          req,
          z
            .string()
            .uuid()
            .parse((req.params as { id: string }).id),
        );
      const messages = (
        await db.query(
          "SELECT direction,actor_type,body FROM (SELECT direction,actor_type,body,sent_at FROM wa_messages WHERE lead_id=$1 UNION ALL SELECT CASE WHEN role='contact' THEN 'inbound' ELSE 'outbound' END,role,body,created_at FROM website_chat_messages WHERE lead_id=$1) m ORDER BY sent_at DESC LIMIT 20",
          [lead.id],
        )
      ).rows.reverse();
      const context = await loadFoundryContext(db, 'internal'),
        provider = generate ?? trackedGemini(db, 'lead_summary', req.authUser!.id);
      const result = await provider(
        `Resuma em português, sem inferir fatos ou promessas. Liste projeto, objetivo, orçamento informado, prazo informado, decisão, urgência, lacunas e próximo contato. Dados: ${JSON.stringify({ name: lead.name, company: lead.company, projectType: lead.project_type, objective: lead.objective, budgetCents: lead.budget_cents, deadline: lead.deadline_text, decisionMaker: lead.decision_maker, urgency: lead.urgency, messages })}`,
        `${FOUNDRY_POLICY}\n${context.context}`,
      );
      await db.query('UPDATE workspace_leads SET ai_summary=$2,ai_summary_at=now() WHERE id=$1', [
        lead.id,
        result.answer,
      ]);
      return result;
    },
  );
  app.get(
    '/api/v1/foundry/lab/scenarios',
    { preHandler: [requirePermission('ai_agent:read')] },
    async () => ({ items: FOUNDRY_SCENARIOS }),
  );
  app.post(
    '/api/v1/foundry/lab/run',
    { preHandler: [requirePermission('ai_agent:read')] },
    async (req) => {
      const input = z.object({ scenario: z.string().max(80) }).parse(req.body),
        scenario = FOUNDRY_SCENARIOS.find((s) => s.slug === input.scenario);
      if (!scenario) throw new WorkspaceError(400, 'Cenário não encontrado.');
      const db = await pool(),
        result = await evaluateFoundry(db, scenario.message, generate, '', 'foundry_lab'),
        passed = result.handoff === scenario.expectedHandoff;
      const row = (
        await db.query(
          'INSERT INTO foundry_lab_runs(actor_id,scenario_slug,answer,model,handoff,passed) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [req.authUser!.id, scenario.slug, result.answer, result.model, result.handoff, passed],
        )
      ).rows[0];
      return { id: row.id, ...result, passed };
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { AttributionInput } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { requestActor, scopedLead } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
import { previewLeadCsv, persistAttribution } from './lead-import.js';
import { offlineAdsConfig, flushOfflineAds } from './offline-ads.js';
import { seal } from './private-fields.js';
export async function registerIntegrationExtras(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
  send: typeof fetch = fetch,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  const csv = z.object({
    csv: z.string().max(1000000),
    id: z.string().uuid().optional(),
    expectedHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  });
  app.post(
    '/api/v1/leads/import/preview',
    { preHandler: [requirePermission('lead:create')], bodyLimit: 1100000 },
    async (req) => {
      const input = csv.parse(req.body),
        data = await previewLeadCsv(await pool(), requestActor(req, 'lead:create'), input.csv);
      return {
        valid: data.valid,
        duplicates: data.duplicates,
        errors: data.errors,
        hash: data.hash,
      };
    },
  );
  app.post(
    '/api/v1/leads/import',
    { preHandler: [requirePermission('lead:create')], bodyLimit: 1100000 },
    async (req, reply) => {
      const input = csv.required({ id: true, expectedHash: true }).parse(req.body),
        p = await pool(),
        actor = requestActor(req, 'lead:create'),
        preview = await previewLeadCsv(p, actor, input.csv);
      if (input.expectedHash !== preview.hash)
        throw new WorkspaceError(409, 'O arquivo mudou. Faça a prévia novamente.');
      if (preview.errors.length)
        throw new WorkspaceError(400, 'Corrija as linhas inválidas antes de importar.');
      const c = await p.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['lead-import:' + actor.id]);
        const old = (await c.query('SELECT * FROM lead_import_batches WHERE id=$1', [input.id]))
          .rows[0];
        if (old) {
          if (old.owner_id !== actor.id || old.file_hash !== preview.hash)
            throw new WorkspaceError(409, 'Identificador de lote indisponível.');
          await c.query('COMMIT');
          return { imported: old.imported, duplicates: old.duplicates, duplicate: true };
        }
        let imported = 0,
          duplicates = 0;
        for (const row of preview.rows) {
          if (!row.data) continue;
          const d = row.data;
          await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [d.phone]);
          const existing = (
            await c.query(
              'SELECT l.id FROM workspace_leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.phone=$1 AND ($2::boolean OR l.owner_id=$3 OR ($4::boolean AND u.team_id=$5)) LIMIT 1',
              [d.phone, actor.scope === 'all', actor.id, actor.scope === 'team', actor.teamId],
            )
          ).rows[0];
          if (existing) {
            duplicates++;
            continue;
          }
          const created = (
            await c.query(
              'INSERT INTO workspace_leads(owner_id,name,company,phone,scope_summary,modality,monthly_value,notes,high_priority,campaign) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
              [
                actor.id,
                d.name,
                d.company,
                d.phone,
                d.scopeSummary,
                d.modality,
                d.monthlyValue,
                d.notes,
                d.highPriority,
                d.campaign ?? '',
              ],
            )
          ).rows[0];
          await persistAttribution(c, created.id, row.attribution);
          imported++;
        }
        await c.query(
          'INSERT INTO lead_import_batches(id,owner_id,file_hash,imported,duplicates) VALUES($1,$2,$3,$4,$5)',
          [input.id, actor.id, preview.hash, imported, duplicates],
        );
        await c.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'lead.csv_import','lead_import',$2,$3)",
          [actor.id, input.id, JSON.stringify({ imported, duplicates, hash: preview.hash })],
        );
        await c.query('COMMIT');
        return reply.code(201).send({ imported, duplicates });
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.get(
    '/api/v1/leads/:id/attribution',
    { preHandler: [requirePermission('lead:read')] },
    async (req) => {
      const lead = await scopedLead(
        await pool(),
        req,
        z
          .string()
          .uuid()
          .parse((req.params as any).id),
      );
      return {
        item: {
          utmSource: lead.utm_source,
          utmMedium: lead.utm_medium,
          utmCampaign: lead.utm_campaign,
          utmTerm: lead.utm_term,
          utmContent: lead.utm_content,
          gclid: lead.gclid,
          adConsent: lead.ad_consent,
          adConsentAt: lead.ad_consent_at,
          version: lead.attribution_version,
        },
      };
    },
  );
  app.put(
    '/api/v1/leads/:id/attribution',
    { preHandler: [requirePermission('lead:update')] },
    async (req) => {
      const p = await pool(),
        lead = await scopedLead(
          p,
          req,
          z
            .string()
            .uuid()
            .parse((req.params as any).id),
          'lead:update',
        ),
        input = z
          .object({ attribution: AttributionInput, version: z.number().int().positive() })
          .parse(req.body),
        c = await p.connect();
      try {
        await c.query('BEGIN');
        const row = (
          await c.query('SELECT attribution_version FROM workspace_leads WHERE id=$1 FOR UPDATE', [
            lead.id,
          ])
        ).rows[0];
        if (row.attribution_version !== input.version)
          throw new WorkspaceError(409, 'A atribuição mudou. Atualize a ficha.');
        await persistAttribution(c, lead.id, input.attribution);
        await c.query(
          'UPDATE workspace_leads SET attribution_version=attribution_version+1 WHERE id=$1',
          [lead.id],
        );
        await c.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'lead.attribution','lead',$2,$3)",
          [
            req.authUser!.id,
            lead.id,
            JSON.stringify({ adConsent: input.attribution.adConsent, version: input.version + 1 }),
          ],
        );
        await c.query('COMMIT');
        return { saved: true };
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.get(
    '/api/v1/integrations/ads/offline',
    { preHandler: [requirePermission('marketing_ads:read')] },
    async (req) => {
      const a = requestActor(req, 'marketing_ads:read'),
        l = requestActor(req, 'lead:read');
      return {
        configured: Boolean(offlineAdsConfig()),
        validateOnly: process.env.CRM_ADS_VALIDATE_ONLY !== 'false',
        items: (
          await (
            await pool()
          ).query(
            'SELECT j.id,j.lead_id,j.evidence_type,j.transaction_id,j.value_cents,j.event_at,j.status,j.validate_only,j.warning_count,j.error_count,j.last_error FROM agency_offline_conversions j JOIN workspace_leads l ON l.id=j.lead_id LEFT JOIN users u ON u.id=l.owner_id WHERE ($1::boolean OR l.owner_id=$2 OR ($3::boolean AND u.team_id=$4)) AND ($5::boolean OR l.owner_id=$2 OR ($6::boolean AND u.team_id=$7)) ORDER BY j.created_at DESC LIMIT 100',
            [
              a.scope === 'all',
              a.id,
              a.scope === 'team',
              a.teamId,
              l.scope === 'all',
              l.scope === 'team',
              l.teamId,
            ],
          )
        ).rows,
      };
    },
  );
  app.post(
    '/api/v1/integrations/ads/offline',
    { preHandler: [requirePermission('marketing_ads:create')] },
    async (req, reply) => {
      const input = z
          .object({
            leadId: z.string().uuid(),
            evidenceType: z.enum(['proposal_accepted', 'payment_received']),
            evidenceId: z.string().uuid(),
            confirmed: z.literal(true),
            eventAt: z.string().datetime({ offset: true }),
          })
          .parse(req.body),
        p = await pool(),
        lead = await scopedLead(p, req, input.leadId),
        a = requestActor(req, 'marketing_ads:create');
      await scopedLead(p, req, lead.id, 'marketing_ads:create');
      if (lead.ad_consent !== 'granted' || !lead.gclid)
        throw new WorkspaceError(409, 'É necessário GCLID e consentimento para Ads concedido.');
      const action =
        input.evidenceType === 'proposal_accepted'
          ? process.env.GOOGLE_ADS_PROPOSAL_ACTION_ID
          : process.env.GOOGLE_ADS_PAYMENT_ACTION_ID;
      if (!action || !/^\d{1,32}$/.test(action))
        throw new WorkspaceError(503, 'Configure a ação de conversão no servidor.');
      await scopedLead(
        p,
        req,
        lead.id,
        input.evidenceType === 'proposal_accepted' ? 'contract:read' : 'finance:read',
      );
      const c = await p.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT id FROM workspace_leads WHERE id=$1 FOR UPDATE', [lead.id]);
        const evidence =
          input.evidenceType === 'proposal_accepted'
            ? (
                await c.query(
                  "SELECT value_cents,updated_at FROM agency_proposals WHERE id=$1 AND lead_id=$2 AND status IN('accepted','active','completed') AND archived_at IS NULL FOR SHARE",
                  [input.evidenceId, lead.id],
                )
              ).rows[0]
            : (
                await c.query(
                  "SELECT amount_cents AS value_cents,paid_at,updated_at FROM agency_charges WHERE id=$1 AND lead_id=$2 AND status='paid' AND archived_at IS NULL FOR SHARE",
                  [input.evidenceId, lead.id],
                )
              ).rows[0];
        if (!evidence)
          throw new WorkspaceError(
            409,
            'O resultado comercial não está confirmado no documento vinculado.',
          );
        const eventAt = new Date(input.eventAt);
        if (eventAt.getTime() > Date.now() + 60000 || eventAt.getTime()<Date.now()-90*86400000)
          throw new WorkspaceError(409, 'A data do resultado está no futuro.');
        const row = (
          await c.query(
            'INSERT INTO agency_offline_conversions(owner_id,lead_id,evidence_type,evidence_id,conversion_action,transaction_id,gclid_ciphertext,value_cents,event_at,validate_only) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(conversion_action,evidence_type,evidence_id) DO UPDATE SET transaction_id=agency_offline_conversions.transaction_id RETURNING id,status',
            [
              a.id,
              lead.id,
              input.evidenceType,
              input.evidenceId,
              action,
              'dc-' + input.evidenceType + '-' + input.evidenceId,
              seal(lead.gclid),
              evidence.value_cents,
              eventAt.toISOString(),
              process.env.CRM_ADS_VALIDATE_ONLY !== 'false',
            ],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'ads.offline_queued','offline_conversion',$2,$3)",
          [
            a.id,
            row.id,
            JSON.stringify({ evidenceType: input.evidenceType, evidenceId: input.evidenceId }),
          ],
        );
        await c.query('COMMIT');
        return reply.code(201).send({ item: row });
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.post(
    '/api/v1/integrations/ads/offline/:id/retry',
    { preHandler: [requirePermission('marketing_ads:update')] },
    async (req) => {
      const id = z
          .string()
          .uuid()
          .parse((req.params as any).id),
        input = z.object({ confirmed: z.literal(true) }).parse(req.body),
        p = await pool(),
        row = (await p.query('SELECT * FROM agency_offline_conversions WHERE id=$1', [id])).rows[0];
      if (!row) throw new WorkspaceError(404, 'Conversão indisponível.');
      await scopedLead(p, req, row.lead_id);
      await scopedLead(p, req, row.lead_id, 'marketing_ads:update');
      if (!['failed', 'validated', 'consent_blocked'].includes(row.status))
        throw new WorkspaceError(409, 'O envio está em andamento ou já foi processado.');
      await p.query(
        "UPDATE agency_offline_conversions SET status='queued',attempts=0,validate_only=$2,last_error=NULL,next_attempt_at=now() WHERE id=$1 AND status IN('failed','validated','consent_blocked')",
        [id, process.env.CRM_ADS_VALIDATE_ONLY !== 'false'],
      );
      await p.query(
        "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'ads.offline_retry','offline_conversion',$2,$3)",
        [
          req.authUser!.id,
          id,
          JSON.stringify({
            confirmed: input.confirmed,
            validateOnly: process.env.CRM_ADS_VALIDATE_ONLY !== 'false',
          }),
        ],
      );
      return { queued: true };
    },
  );
  let working = false;
  const timer = setInterval(() => {
    if (working) return;
    working = true;
    void pool()
      .then((p) => flushOfflineAds(p, send))
      .catch(() => undefined)
      .finally(() => {
        working = false;
      });
  }, 60000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
}

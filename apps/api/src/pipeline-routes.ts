import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { PipelineConfigInput } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { scopedLead } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
export async function registerPipelineRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
) {
  const db = async () => {
    const connection = await database();
    if (!connection) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return connection.pool;
  };
  app.get('/api/v1/pipeline', { preHandler: [requirePermission('pipeline:read')] }, async () => {
    const pool = await db(),
      pipeline = (
        await pool.query(
          'SELECT id,version FROM pipelines WHERE is_default=true ORDER BY created_at LIMIT 1',
        )
      ).rows[0];
    if (!pipeline) throw new WorkspaceError(503, 'Inicialize o funil com db:seed.');
    return {
      version: pipeline.version,
      stages: (
        await pool.query(
          'SELECT slug AS id,name,color_hex AS color,sla_minutes AS "slaMinutes",is_won AS "isWon",is_lost AS "isLost" FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position',
          [pipeline.id],
        )
      ).rows,
    };
  });
  app.put(
    '/api/v1/pipeline',
    { preHandler: [requirePermission('pipeline:manage')] },
    async (req) => {
      const input = PipelineConfigInput.parse(req.body),
        pool = await db(),
        client = await pool.connect();
      try {
        await client.query('BEGIN');
        const pipeline = (
          await client.query(
            'SELECT * FROM pipelines WHERE is_default=true ORDER BY created_at LIMIT 1 FOR UPDATE',
          )
        ).rows[0];
        if (!pipeline || pipeline.version !== input.version)
          throw new WorkspaceError(409, 'O funil foi alterado. Atualize antes de salvar.');
        const ids = input.stages.map((s) => s.id),
          used = await client.query(
            'SELECT id FROM workspace_leads WHERE pipeline_id=$1 AND NOT(stage=ANY($2::varchar[])) LIMIT 1',
            [pipeline.id, ids],
          );
        if (used.rows.length)
          throw new WorkspaceError(
            409,
            'Mova os contatos, inclusive arquivados, antes de remover uma etapa usada.',
          );
        await client.query(
          'INSERT INTO pipeline_stage_revisions(pipeline_id,version,slug,name,position,sla_minutes,color_hex,is_won,is_lost,actor_id) SELECT pipeline_id,$2,slug,name,position,sla_minutes,color_hex,is_won,is_lost,$3 FROM pipeline_stages WHERE pipeline_id=$1',
          [pipeline.id, pipeline.version, req.authUser!.id],
        );
        await client.query(
          'DELETE FROM pipeline_stages WHERE pipeline_id=$1 AND NOT(slug=ANY($2::varchar[]))',
          [pipeline.id, ids],
        );
        await client.query(
          'UPDATE pipeline_stages SET position=position+10000 WHERE pipeline_id=$1',
          [pipeline.id],
        );
        for (const [i, s] of input.stages.entries())
          await client.query(
            'INSERT INTO pipeline_stages(pipeline_id,slug,name,position,sla_minutes,color_hex,is_won,is_lost) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(pipeline_id,slug) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,sla_minutes=EXCLUDED.sla_minutes,color_hex=EXCLUDED.color_hex,is_won=EXCLUDED.is_won,is_lost=EXCLUDED.is_lost',
            [pipeline.id, s.id, s.name, i + 1, s.slaMinutes, s.color, s.isWon, s.isLost],
          );
        await client.query('UPDATE pipelines SET version=version+1 WHERE id=$1', [pipeline.id]);
        await client.query(
          `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'pipeline.update','pipeline',$2,$3)`,
          [req.authUser!.id, pipeline.id, JSON.stringify({ stages: input.stages })],
        );
        await client.query('COMMIT');
        return { version: pipeline.version + 1, stages: input.stages };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );
  const idFrom = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id;
  app.get(
    '/api/v1/leads/:id/extras',
    { preHandler: [requirePermission('lead:read')] },
    async (req) => {
      const pool = await db(),
        id = idFrom(req.params);
      await scopedLead(pool, req, id);
      return {
        tags: (
          await pool.query(
            'SELECT t.* FROM lead_tags t JOIN lead_tag_links l ON l.tag_id=t.id WHERE l.lead_id=$1 ORDER BY t.name',
            [id],
          )
        ).rows,
        attachments: (
          await pool.query(
            'SELECT id,file_name,mime_type,bytes,sha256,created_at FROM lead_attachments WHERE lead_id=$1 ORDER BY created_at DESC',
            [id],
          )
        ).rows,
      };
    },
  );
  app.put(
    '/api/v1/leads/:id/tags',
    { preHandler: [requirePermission('lead:update')] },
    async (req) => {
      const pool = await db(),
        id = idFrom(req.params),
        input = z
          .object({
            tags: z
              .array(
                z.object({
                  name: z.string().trim().min(1).max(40),
                  color: z
                    .string()
                    .regex(/^#[a-f0-9]{6}$/i)
                    .default('#246ba5'),
                }),
              )
              .max(15),
          })
          .parse(req.body);
      await scopedLead(pool, req, id, 'lead:update');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM lead_tag_links WHERE lead_id=$1', [id]);
        for (const tag of input.tags) {
          const row = (
            await client.query(
              'INSERT INTO lead_tags(name,color) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
              [tag.name, tag.color],
            )
          ).rows[0];
          await client.query(
            'INSERT INTO lead_tag_links(lead_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [id, row.id],
          );
        }
        await client.query(
          `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'lead.tags','lead',$2,$3)`,
          [req.authUser!.id, id, JSON.stringify({ tags: input.tags })],
        );
        await client.query('COMMIT');
        return { saved: true };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );
  app.post(
    '/api/v1/leads/:id/attachments',
    { preHandler: [requirePermission('lead:update')], bodyLimit: 24 * 1024 * 1024 },
    async (req, reply) => {
      const pool = await db(),
        id = idFrom(req.params);
      await scopedLead(pool, req, id, 'lead:update');
      const input = z
          .object({
            name: z.string().trim().min(1).max(180),
            mime: z
              .string()
              .regex(/^[a-z]+\/[a-z0-9.+-]+$/i)
              .max(150),
            base64: z
              .string()
              .min(4)
              .max(22369624)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .parse(req.body),
        bytes = Buffer.from(input.base64, 'base64');
      if (!bytes.length || bytes.length > 16777216)
        throw new WorkspaceError(400, 'Use um arquivo de até 16 MB.');
      const key = 'lead-' + randomUUID(),
        directory = process.env.CRM_UPLOAD_DIR || '/data/uploads';
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, key), bytes, { mode: 0o600, flag: 'wx' });
      const row = (
        await pool.query(
          'INSERT INTO lead_attachments(lead_id,owner_id,file_name,mime_type,storage_key,bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            id,
            req.authUser!.id,
            input.name.replace(/[\r\n"\\/]/g, '_'),
            input.mime,
            key,
            bytes.length,
            createHash('sha256').update(bytes).digest('hex'),
          ],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'lead.attachment','lead',$2,$3)`,
        [req.authUser!.id, id, JSON.stringify({ attachmentId: row.id, bytes: bytes.length })],
      );
      return reply.status(201).send(row);
    },
  );
  app.get(
    '/api/v1/leads/:id/attachments/:fileId',
    { preHandler: [requirePermission('lead:read')] },
    async (req, reply) => {
      const pool = await db(),
        id = idFrom(req.params);
      await scopedLead(pool, req, id);
      const fileId = z
          .string()
          .uuid()
          .parse((req.params as { fileId: string }).fileId),
        row = (
          await pool.query('SELECT * FROM lead_attachments WHERE id=$1 AND lead_id=$2', [
            fileId,
            id,
          ])
        ).rows[0];
      if (!row || !/^lead-[a-f0-9-]{36}$/.test(row.storage_key))
        throw new WorkspaceError(404, 'Anexo indisponível.');
      const path = join(process.env.CRM_UPLOAD_DIR || '/data/uploads', row.storage_key);
      if (!(await stat(path).catch(() => null)))
        throw new WorkspaceError(404, 'Anexo indisponível.');
      return reply
        .header('Cache-Control', 'private, no-store')
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        )
        .type('application/octet-stream')
        .send(createReadStream(path));
    },
  );
}

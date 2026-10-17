import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it, expect } from 'vitest';
import { createDatabaseConnection } from '@dcfoundry/db';
import { PostgresWorkspaceStore } from '../apps/api/src/workspace-store.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { hashPassword } from '../apps/api/src/plugins/auth.js';
import { ModuleStore } from '../apps/api/src/module-store.js';
import { flushBlogOutbox } from '../apps/api/src/blog-publishing.js';

it.skipIf(!process.env.CRM_TEST_DATABASE_URL)(
  'starts empty, persists owner-scoped leads and clears business data with a verified backup',
  async () => {
    const url = process.env.CRM_TEST_DATABASE_URL!;
    const database = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!database.endsWith('_ci'))
      throw new Error('Integration tests require a disposable *_ci database.');
    const { pool } = await createDatabaseConnection(url, '');
    const owner = randomUUID(),
      other = randomUUID();
    const password = randomUUID();
    const backupDirectory = await mkdtemp(join(tmpdir(), 'dcf-crm-reset-'));
    const mediaDirectory = await mkdtemp(join(tmpdir(), 'dcf-crm-media-'));
    const previousMediaDirectory = process.env.CRM_UPLOAD_DIR;
    process.env.CRM_UPLOAD_DIR = mediaDirectory;
    try {
      for (const table of [
        'workspace_leads',
        'contacts',
        'contracts',
        'products',
        'equipment_units',
        'kb_documents',
      ])
        expect(
          Number((await pool.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count),
        ).toBe(0);
      await pool.query(
        'INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
        [
          owner,
          `${owner}@ci.example`,
          'CI Owner',
          hashPassword(password),
          other,
          `${other}@ci.example`,
          'CI Other',
          'not-a-login-hash',
        ],
      );
      const store = new PostgresWorkspaceStore(pool);
      const item = await store.create(
        {
          name: 'CI Contact',
          company: 'CI Company',
          phone: '+5541999999999',
          scopeSummary: 'Test',
          modality: 'Projeto Fechado',
          monthlyValue: 1234.56,
          notes: '',
          highPriority: true,
        },
        owner,
      );
      expect(item.monthlyValue).toBe(1234.56);
      expect(await store.list({ id: owner, teamId: null, scope: 'own' })).toHaveLength(1);
      expect(await store.list({ id: other, teamId: null, scope: 'own' })).toHaveLength(0);
      expect(
        await store.setStage(item.id, 'orcamento', { id: other, teamId: null, scope: 'own' }),
      ).toBeNull();
      expect(
        (await store.setStage(item.id, 'orcamento', { id: owner, teamId: null, scope: 'own' }))
          ?.stage,
      ).toBe('orcamento');
      await pool.query(
        "INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE slug='vendedor'",
        [owner],
      );
      const { app } = await buildApiServer();
      try {
        const login = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: `${owner}@ci.example`, password },
        });
        expect(login.statusCode).toBe(200);
        expect(login.json().user.roles).toEqual(['vendedor']);
        const headers = { authorization: `Bearer ${login.json().accessToken}` };
        const created = await app.inject({
          method: 'POST',
          url: '/api/v1/workspace/leads',
          headers,
          payload: { name: 'API Contact', company: 'API Company', phone: '+5541999999999' },
        });
        expect(created.statusCode).toBe(201);
        const id = created.json().item.id;
        const listing = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/leads',
          headers,
        });
        expect(listing.json().items).toHaveLength(2);
        const advanced = await app.inject({
          method: 'PATCH',
          url: `/api/v1/workspace/leads/${id}/stage`,
          headers,
          payload: { stage: 'qualificado_ia' },
        });
        expect(advanced.statusCode).toBe(200);
        expect(advanced.json().item.stage).toBe('qualificado_ia');
        const editedLead = await app.inject({
          method: 'PUT',
          url: `/api/v1/workspace/leads/${id}`,
          headers,
          payload: {
            name: 'Contato atualizado',
            company: 'Empresa atualizada',
            phone: '+5541999999999',
          },
        });
        expect(editedLead.statusCode, editedLead.body).toBe(200);
        expect(editedLead.json().item.name).toBe('Contato atualizado');
        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/v1/workspace/leads/${id}/archive`,
              headers,
              payload: { archived: true },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({ method: 'GET', url: '/api/v1/workspace/leads?archived=1', headers })
          ).json().items,
        ).toHaveLength(1);
        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/v1/workspace/leads/${id}/archive`,
              headers,
              payload: { archived: false },
            })
          ).statusCode,
        ).toBe(200);
        expect(await store.list({ id: other, teamId: null, scope: 'own' })).toHaveLength(0);
        expect(
          (await app.inject({ method: 'GET', url: '/api/v1/workspace/blog', headers })).statusCode,
        ).toBe(403);
        await pool.query(
          "INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE slug='admin'",
          [owner],
        );
        const adminLogin = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: `${owner}@ci.example`, password },
        });
        const admin = { authorization: `Bearer ${adminLogin.json().accessToken}` };
        const article = {
          title: 'Artigo de integração',
          slug: 'artigo-integracao',
          content:
            '## Conteúdo seguro\n\nUma explicação completa para os leitores. <script>alert(1)</script>',
          excerpt: 'Resumo do artigo',
          author: 'Equipe DC',
          tags: ['software'],
          status: 'draft',
        };
        const draft = await app.inject({
          method: 'POST',
          url: '/api/v1/workspace/blog',
          headers: admin,
          payload: { data: article },
        });
        expect(draft.statusCode, draft.body).toBe(201);
        const post = draft.json().item;
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts/artigo-integracao' }))
            .statusCode,
        ).toBe(404);
        const publication = await app.inject({
          method: 'PUT',
          url: `/api/v1/workspace/blog/${post.id}`,
          headers: admin,
          payload: { data: { ...article, status: 'published' }, version: 1 },
        });
        expect(publication.statusCode, publication.body).toBe(200);
        const publicArticle = await app.inject({
          method: 'GET',
          url: '/api/blog/posts/artigo-integracao',
        });
        expect(publicArticle.statusCode, publicArticle.body).toBe(200);
        expect(publicArticle.json().content).not.toContain('<script>');
        expect(publicArticle.json().content).toContain('&lt;script&gt;');
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts?limit=200&offset=0' })).json()
            .total,
        ).toBe(1);
        expect(
          (
            await app.inject({
              method: 'PUT',
              url: `/api/v1/workspace/blog/${post.id}`,
              headers: admin,
              payload: { data: article, version: 1 },
            })
          ).statusCode,
        ).toBe(409);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/workspace/blog',
              headers: admin,
              payload: { data: article },
            })
          ).statusCode,
        ).toBe(409);
        const versions = await app.inject({
          method: 'GET',
          url: `/api/v1/workspace/blog/${post.id}/versions`,
          headers: admin,
        });
        expect(versions.json().items[0].version).toBe(1);
        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/v1/workspace/blog/${post.id}/archive`,
              headers: admin,
              payload: { version: 2, archived: true },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts/artigo-integracao' }))
            .statusCode,
        ).toBe(404);
        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/v1/workspace/blog/${post.id}/archive`,
              headers: admin,
              payload: { version: 3, archived: false },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts/artigo-integracao' }))
            .statusCode,
        ).toBe(200);
        const scheduled = await app.inject({
          method: 'POST',
          url: '/api/v1/workspace/blog',
          headers: admin,
          payload: {
            data: {
              ...article,
              slug: 'agendado',
              status: 'scheduled',
              scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        });
        expect(scheduled.statusCode, scheduled.body).toBe(201);
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts/agendado' })).statusCode,
        ).toBe(404);
        await pool.query(
          "UPDATE workspace_documents SET data=jsonb_set(data,'{scheduledAt}',to_jsonb($2::text)) WHERE id=$1",
          [scheduled.json().item.id, new Date(Date.now() - 60000).toISOString()],
        );
        expect(
          (await app.inject({ method: 'GET', url: '/api/blog/posts/agendado' })).statusCode,
        ).toBe(200);
        const scheduledRename = await app.inject({
          method: 'PUT',
          url: `/api/v1/workspace/blog/${scheduled.json().item.id}`,
          headers: admin,
          payload: { data: { ...article, slug: 'outra-url', status: 'published' }, version: 1 },
        });
        expect(scheduledRename.statusCode).toBe(409);
        const examples = {
          contract: {
            title: 'Proposta de software',
            client: 'CI Company',
            valueCents: 150000,
            billing: 'project',
            scope: 'Escopo de teste',
            status: 'draft',
          },
          invoice: {
            title: 'Primeira parcela',
            client: 'CI Company',
            amountCents: 50000,
            dueDate: '2026-12-30',
            status: 'open',
          },
          task: {
            title: 'Revisar a proposta',
            dueDate: '2026-12-20',
            status: 'open',
            priority: 'high',
          },
          template: { title: 'Boas-vindas', content: 'Olá, {nome}! Vamos conhecer sua ideia?' },
          knowledge: {
            title: 'Sobre os serviços',
            content: 'Criamos software e experiências digitais sob medida.',
          },
          assistant: {
            title: 'Foundry',
            instructions: 'Responda em português e nunca invente valores ou resultados.',
          },
        };
        for (const [kind, data] of Object.entries(examples)) {
          const response = await app.inject({
            method: 'POST',
            url: `/api/v1/workspace/${kind}`,
            headers: admin,
            payload: { data, leadId: id },
          });
          expect(response.statusCode, `${kind}: ${response.body}`).toBe(201);
          const listing = await app.inject({
            method: 'GET',
            url: `/api/v1/workspace/${kind}`,
            headers: admin,
          });
          expect(listing.json().items.length).toBeGreaterThan(0);
        }
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/workspace/invoice',
              headers: admin,
              payload: { data: { ...examples.invoice, status: 'paid' } },
            })
          ).statusCode,
        ).toBe(400);
        const metric = {
          title: 'Campanha de teste',
          campaignId: 'CI',
          account: 'test',
          date: '2026-10-17',
          costCents: 1200,
          impressions: 1000,
          clicks: 12,
          conversions: 1,
          currency: 'BRL',
        };
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/workspace/campaign-import',
              headers: admin,
              payload: { items: [metric] },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/workspace/campaign-import',
              headers: admin,
              payload: { items: [{ ...metric, clicks: 15 }] },
            })
          ).statusCode,
        ).toBe(200);
        const metrics = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/campaign',
          headers: admin,
        });
        expect(metrics.json().items).toHaveLength(1);
        expect(metrics.json().items[0].data.clicks).toBe(15);
        const moduleStore = new ModuleStore(pool);
        await expect(
          moduleStore.importCampaigns(
            { id: owner, teamId: null, scope: 'own' },
            [{ ...metric, campaignId: 'CI-ROLLBACK' }, metric] as any,
            false,
          ),
        ).rejects.toThrow();
        expect(
          Number(
            (
              await pool.query(
                "SELECT count(*) AS total FROM workspace_documents WHERE kind='campaign' AND data->>'campaignId'='CI-ROLLBACK'",
              )
            ).rows[0].total,
          ),
        ).toBe(0);
        const summary = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/daily-summary',
          headers: admin,
        });
        expect(summary.json().taskPending).toBe(1);
        expect(summary.json().invoicePending).toBe(1);
        const media = await app.inject({
          method: 'POST',
          url: '/api/v1/media',
          headers: admin,
          payload: {
            image:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
          },
        });
        expect(media.statusCode, media.body).toBe(201);
        expect(
          (await app.inject({ method: 'GET', url: media.json().url })).headers['content-type'],
        ).toBe('image/png');
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/media',
              headers: admin,
              payload: { image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
            })
          ).statusCode,
        ).toBe(400);
        const audit = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/audit',
          headers: admin,
        });
        expect(
          audit.json().items.some((entry: { action: string }) => entry.action === 'blog.archive'),
        ).toBe(true);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/workspace/assistant-chat',
              headers: admin,
              payload: { message: 'Organize um briefing.' },
            })
          ).statusCode,
        ).toBe(503);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/integrations/ads/metrics',
              payload: { items: [metric], ownerId: owner },
            })
          ).statusCode,
        ).toBe(401);
        // Exercise the actual database-backed report, project and intake paths.
        const project = await app.inject({
          method: 'POST',
          url: '/api/v1/workspace/project',
          headers: admin,
          payload: {
            data: {
              title: 'CI project',
              client: 'CI client',
              progress: 35,
              stack: 'React, Node.js',
              status: 'development',
            },
          },
        });
        expect(project.statusCode, project.body).toBe(201);
        const otherLead = await store.create(
          {
            name: 'Other owner',
            company: 'Other owner company',
            phone: '+5541999999999',
            scopeSummary: '',
            modality: 'Projeto Fechado',
            monthlyValue: 777,
            notes: '',
            highPriority: false,
          },
          other,
        );
        await new ModuleStore(pool).save(
          'project',
          { id: other, teamId: null, scope: 'own' },
          {
            title: 'Other owner project',
            client: 'Other owner company',
            status: 'development',
            priority: 'normal',
            progress: 5,
            startDate: '',
            dueDate: '',
            budgetCents: 0,
            scope: '',
            notes: '',
            stack: 'Private stack',
            url: '',
          },
          otherLead.id,
        );
        const beforeReport = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/report?days=7',
          headers: admin,
        });
        expect(beforeReport.statusCode, beforeReport.body).toBe(200);
        expect(beforeReport.json().totals.activeProjects).toBe(2);
        expect(beforeReport.json().projects.some((p: any) => p.stack === 'React, Node.js')).toBe(
          true,
        );
        const vendorReport = await app.inject({
          method: 'GET',
          url: '/api/v1/workspace/report?days=30',
          headers,
        });
        expect(vendorReport.statusCode, vendorReport.body).toBe(200);
        expect(vendorReport.json().access.invoice).toBe(false);
        expect(vendorReport.json().totals.receivedCents).toBe(0);
        expect(vendorReport.json().coverage.leads).toBe(
          (await store.list({ id: owner, teamId: null, scope: 'own' })).length,
        );
        expect(vendorReport.json().projects.some((p: any) => p.stack === 'Private stack')).toBe(
          false,
        );
        expect(
          (await app.inject({ method: 'GET', url: '/api/v1/workspace/report' })).statusCode,
        ).toBe(401);
        expect(
          (
            await app.inject({
              method: 'GET',
              url: '/api/v1/workspace/report?days=1000',
              headers: admin,
            })
          ).statusCode,
        ).toBe(400);
        const savedSiteToken = process.env.CRM_SITE_INGEST_TOKEN,
          savedSiteOwner = process.env.CRM_SITE_OWNER_ID;
        process.env.CRM_SITE_INGEST_TOKEN = randomUUID() + randomUUID();
        process.env.CRM_SITE_OWNER_ID = owner;
        try {
          const siteHeaders = { authorization: `Bearer ${process.env.CRM_SITE_INGEST_TOKEN}` };
          const event = {
            id: randomUUID(),
            event: 'page_view',
            path: '/blog',
            source: 'google',
            medium: 'organic',
            campaign: '',
            occurredAt: new Date().toISOString(),
          };
          expect(
            (
              await app.inject({
                method: 'POST',
                url: '/api/v1/integrations/site/events',
                payload: { items: [event] },
              })
            ).statusCode,
          ).toBe(401);
          const firstEvent = await app.inject({
            method: 'POST',
            url: '/api/v1/integrations/site/events',
            headers: siteHeaders,
            payload: { items: [event] },
          });
          expect(firstEvent.statusCode, firstEvent.body).toBe(200);
          expect(firstEvent.json().accepted).toBe(1);
          expect(
            (
              await app.inject({
                method: 'POST',
                url: '/api/v1/integrations/site/events',
                headers: siteHeaders,
                payload: { items: [event] },
              })
            ).json().duplicates,
          ).toBe(1);
          expect(
            (
              await app.inject({
                method: 'POST',
                url: '/api/v1/integrations/site/events',
                headers: siteHeaders,
                payload: { items: [{ ...event, id: randomUUID(), path: '/blog?phone=123' }] },
              })
            ).statusCode,
          ).toBe(400);
          const submission = {
            id: randomUUID(),
            lead: {
              name: 'Website test',
              company: 'Site test',
              phone: '+5541999999999',
              campaign: 'blog-ci',
              scopeSummary: 'Briefing de integração',
            },
          };
          const intake = await app.inject({
            method: 'POST',
            url: '/api/v1/integrations/site/leads',
            headers: siteHeaders,
            payload: submission,
          });
          expect(intake.statusCode, intake.body).toBe(201);
          const duplicate = await app.inject({
            method: 'POST',
            url: '/api/v1/integrations/site/leads',
            headers: siteHeaders,
            payload: submission,
          });
          expect(duplicate.json()).toMatchObject({ id: intake.json().id, duplicate: true });
          expect(
            (
              await pool.query('SELECT campaign FROM workspace_leads WHERE id=$1', [
                intake.json().id,
              ])
            ).rows[0].campaign,
          ).toBe('blog-ci');
          const afterReport = await app.inject({
            method: 'GET',
            url: '/api/v1/workspace/report?days=7',
            headers: admin,
          });
          expect(afterReport.statusCode, afterReport.body).toBe(200);
          expect(afterReport.json().totals.pageViews).toBe(1);
          expect(afterReport.json().coverage.leads).toBe(beforeReport.json().coverage.leads + 1);
        } finally {
          if (savedSiteToken === undefined) delete process.env.CRM_SITE_INGEST_TOKEN;
          else process.env.CRM_SITE_INGEST_TOKEN = savedSiteToken;
          if (savedSiteOwner === undefined) delete process.env.CRM_SITE_OWNER_ID;
          else process.env.CRM_SITE_OWNER_ID = savedSiteOwner;
        }
      } finally {
        await app.close();
      }
      const oldWebhook = process.env.BLOG_SITE_WEBHOOK_URL,
        oldSecret = process.env.BLOG_REVALIDATE_SECRET;
      process.env.BLOG_SITE_WEBHOOK_URL = 'https://site.example/api/blog/revalidate';
      process.env.BLOG_REVALIDATE_SECRET = 'test-only-webhook-secret-32-characters';
      try {
        const failed = await flushBlogOutbox(
          pool,
          (async () => new Response('{}', { status: 503 })) as typeof fetch,
        );
        expect(failed.delivered).toBe(0);
        expect(
          Number(
            (
              await pool.query(
                'SELECT count(*) AS total FROM workspace_blog_outbox WHERE attempts>0 AND delivered_at IS NULL',
              )
            ).rows[0].total,
          ),
        ).toBeGreaterThan(0);
        await pool.query(
          'UPDATE workspace_blog_outbox SET next_attempt_at=now() WHERE delivered_at IS NULL',
        );
        const retried = await flushBlogOutbox(pool, (async () =>
          Response.json({ revalidated: true, indexing: { status: 'disabled' } })) as typeof fetch);
        expect(retried.delivered).toBeGreaterThan(0);
      } finally {
        if (oldWebhook === undefined) delete process.env.BLOG_SITE_WEBHOOK_URL;
        else process.env.BLOG_SITE_WEBHOOK_URL = oldWebhook;
        if (oldSecret === undefined) delete process.env.BLOG_REVALIDATE_SECRET;
        else process.env.BLOG_REVALIDATE_SECRET = oldSecret;
      }
      const beforeRoles = Number(
        (await pool.query('SELECT count(*) AS count FROM roles')).rows[0].count,
      );
      await promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          'packages/db/src/reset-data.ts',
          '--database',
          database,
          '--confirm-clear-business-data',
        ],
        {
          cwd: resolve(import.meta.dirname, '..'),
          env: { ...process.env, DATABASE_URL: url, CRM_BACKUP_DIRECTORY: backupDirectory },
          timeout: 30_000,
        },
      );
      expect(
        Number((await pool.query('SELECT count(*) AS count FROM workspace_leads')).rows[0].count),
      ).toBe(0);
      expect(Number((await pool.query('SELECT count(*) AS count FROM roles')).rows[0].count)).toBe(
        beforeRoles,
      );
      expect((await pool.query('SELECT id FROM users WHERE id=$1', [owner])).rows).toHaveLength(1);
      const files = await readdir(backupDirectory);
      expect(files).toHaveLength(1);
      const backup = JSON.parse(await readFile(join(backupDirectory, files[0]!), 'utf8'));
      expect(backup.database).toBe(database);
      expect(backup.tables.workspace_leads[0].id).toBe(item.id);
    } finally {
      await pool.query('DELETE FROM workspace_site_intakes WHERE owner_id IN ($1,$2)', [
        owner,
        other,
      ]);
      await pool.query('DELETE FROM workspace_site_events WHERE owner_id IN ($1,$2)', [
        owner,
        other,
      ]);
      await pool.query('DELETE FROM workspace_documents WHERE owner_id IN ($1,$2)', [owner, other]);
      await pool.query('DELETE FROM workspace_leads WHERE owner_id IN ($1,$2)', [owner, other]);
      await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [owner, other]);
      await pool.end();
      if (previousMediaDirectory === undefined) delete process.env.CRM_UPLOAD_DIR;
      else process.env.CRM_UPLOAD_DIR = previousMediaDirectory;
      for (const file of await readdir(mediaDirectory)) await unlink(join(mediaDirectory, file));
      await rmdir(mediaDirectory);
      for (const file of await readdir(backupDirectory)) await unlink(join(backupDirectory, file));
      await rmdir(backupDirectory);
    }
  },
  60_000,
);

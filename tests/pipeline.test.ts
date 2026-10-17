import { it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PipelineConfigInput, DEFAULT_PIPELINE_STAGES } from '@dcfoundry/shared';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
it('rejects invalid or ambiguous pipeline configurations', () => {
  expect(
    PipelineConfigInput.safeParse({ version: 1, stages: DEFAULT_PIPELINE_STAGES }).success,
  ).toBe(true);
  expect(
    PipelineConfigInput.safeParse({
      version: 1,
      stages: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, isWon: false })),
    }).success,
  ).toBe(false);
  expect(
    PipelineConfigInput.safeParse({
      version: 1,
      stages: [...DEFAULT_PIPELINE_STAGES, DEFAULT_PIPELINE_STAGES[0]],
    }).success,
  ).toBe(false);
});
it('upgrades existing leads, configures stages, preserves archived tags and files, and reports custom wins', async () => {
  const owner = randomUUID(),
    other = randomUUID(),
    leadId = randomUUID();
  const database = await testDatabase(async (name, db) => {
    if (name !== '0009_pipeline_lead_files.sql') return;
    await db.query(
      `INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@pipeline.example','Owner','hash'),($2,'other@pipeline.example','Other','hash')`,
      [owner, other],
    );
    await db.query(
      `INSERT INTO workspace_leads(id,owner_id,name,company,phone,stage,monthly_value) VALUES($1,$2,'Contato anterior','Empresa anterior','+5541999999999','orcamento',5000)`,
      [leadId, owner],
    );
  });
  const folder = await mkdtemp(join(tmpdir(), 'dc-lead-files-')),
    previous = process.env.CRM_UPLOAD_DIR;
  process.env.CRM_UPLOAD_DIR = folder;
  const { app } = await buildApiServer({ testDatabase: database });
  const headers = (id: string, role: 'admin' | 'vendedor') => ({
      authorization: `Bearer ${signAccessToken({ id, email: id + '@pipeline.example', fullName: 'Test', roles: [role], teamId: null, totpEnabled: false })}`,
    }),
    admin = headers(owner, 'admin');
  try {
    const before = await app.inject({ url: '/api/v1/workspace/leads', headers: admin });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().items[0].id).toBe(leadId);
    expect(before.json().items[0].stageName).toBe('Proposta');
    const pipeline = (await app.inject({ url: '/api/v1/pipeline', headers: admin })).json();
    expect(pipeline.stages.map((s: { name: string }) => s.name)).toEqual([
      'Novo',
      'Qualificado',
      'Reunião',
      'Proposta',
      'Negociação',
      'Ganho',
      'Perdido',
    ]);
    const custom = {
        id: 'briefing',
        name: 'Em briefing',
        color: '#246ba5',
        slaMinutes: 45,
        isWon: false,
        isLost: false,
      },
      stages = [...pipeline.stages.slice(0, 2), custom, ...pipeline.stages.slice(2)];
    const save = await app.inject({
      method: 'PUT',
      url: '/api/v1/pipeline',
      headers: admin,
      payload: { version: 1, stages },
    });
    expect(save.statusCode, save.body).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/pipeline',
          headers: headers(other, 'vendedor'),
          payload: { version: 2, stages },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/pipeline',
          headers: admin,
          payload: { version: 1, stages },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/workspace/leads/${leadId}/stage`,
          headers: admin,
          payload: { stage: 'briefing' },
        })
      ).statusCode,
    ).toBe(200);
    const remove = await app.inject({
      method: 'PUT',
      url: '/api/v1/pipeline',
      headers: admin,
      payload: { version: 2, stages: pipeline.stages },
    });
    expect(remove.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/leads/${leadId}/tags`,
          headers: admin,
          payload: {
            tags: [
              { name: 'Site', color: '#246ba5' },
              { name: 'SEO', color: '#198980' },
            ],
          },
        })
      ).statusCode,
    ).toBe(200);
    const bytes = Buffer.from('Briefing de teste descartável'),
      upload = await app.inject({
        method: 'POST',
        url: `/api/v1/leads/${leadId}/attachments`,
        headers: admin,
        payload: { name: 'briefing.txt', mime: 'text/plain', base64: bytes.toString('base64') },
      });
    expect(upload.statusCode, upload.body).toBe(201);
    const extras = await app.inject({ url: `/api/v1/leads/${leadId}/extras`, headers: admin });
    expect(extras.json().tags).toHaveLength(2);
    expect(extras.json().attachments[0].sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(
      (
        await app.inject({
          url: `/api/v1/leads/${leadId}/attachments/${upload.json().id}`,
          headers: headers(other, 'vendedor'),
        })
      ).statusCode,
    ).toBe(404);
    const file = await app.inject({
      url: `/api/v1/leads/${leadId}/attachments/${upload.json().id}`,
      headers: admin,
    });
    expect(file.body).toBe(bytes.toString());
    expect(file.headers['cache-control']).toContain('no-store');
    for (const archived of [true, false])
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/workspace/leads/${leadId}/archive`,
            headers: admin,
            payload: { archived },
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (await app.inject({ url: `/api/v1/leads/${leadId}/extras`, headers: admin })).json()
        .attachments,
    ).toHaveLength(1);
    const customWon = stages.map((s) => ({ ...s, isWon: s.id === 'briefing' }));
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/pipeline',
          headers: admin,
          payload: { version: 2, stages: customWon },
        })
      ).statusCode,
    ).toBe(200);
    const report = await app.inject({ url: '/api/v1/workspace/report?days=30', headers: admin });
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json().totals.activeClients).toBe(1);
    expect(
      report.json().funnel.find((s: { stage: string }) => s.stage === 'briefing').stageName,
    ).toBe('Em briefing');
  } finally {
    await app.close();
    await database.pool.end();
    if (previous === undefined) delete process.env.CRM_UPLOAD_DIR;
    else process.env.CRM_UPLOAD_DIR = previous;
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);

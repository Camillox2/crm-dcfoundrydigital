import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it, expect } from 'vitest';
import { createDatabaseConnection } from '@dcfoundry/db';
import { PostgresWorkspaceStore } from '../apps/api/src/workspace-store.js';

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
    const backupDirectory = await mkdtemp(join(tmpdir(), 'dcf-crm-reset-'));
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
          'not-a-login-hash',
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
      await pool.query('DELETE FROM workspace_leads WHERE owner_id IN ($1,$2)', [owner, other]);
      await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [owner, other]);
      await pool.end();
      for (const file of await readdir(backupDirectory)) await unlink(join(backupDirectory, file));
      await rmdir(backupDirectory);
    }
  },
  60_000,
);

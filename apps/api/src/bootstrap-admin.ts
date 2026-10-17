import { createDatabaseConnection } from '@dcfoundry/db';
import { z } from 'zod';
import { hashPassword } from './plugins/auth.js';

const email = z.string().email().parse(process.env.CRM_ADMIN_EMAIL);
const password = z.string().min(12).parse(process.env.CRM_ADMIN_PASSWORD);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const { pool } = await createDatabaseConnection(process.env.DATABASE_URL, '');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(78431022)');
  const role = await client.query("SELECT id FROM roles WHERE slug='admin'");
  if (!role.rows.length) throw new Error('Run db:seed before creating the administrator.');
  const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
  if (existing.rows.length)
    throw new Error('This user already exists. No password or permissions were overwritten.');
  const user = await client.query(
    'INSERT INTO users(email,full_name,password_hash) VALUES($1,$2,$3) RETURNING id',
    [email, process.env.CRM_ADMIN_NAME?.trim() || 'Administrador', hashPassword(password)],
  );
  await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)', [
    user.rows[0].id,
    role.rows[0].id,
  ]);
  await client.query('COMMIT');
  console.log('Administrator created. No password is printed or stored in source.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

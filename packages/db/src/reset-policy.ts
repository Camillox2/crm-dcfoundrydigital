export const PRESERVED_CONFIGURATION_TABLES = new Set([
  'users',
  'roles',
  'user_roles',
  'auth_sessions',
  'pipelines',
  'pipeline_stages',
  'foundry_settings',
  'company_settings',
  'calendar_settings',
  'crm_schema_migrations',
  '__drizzle_migrations',
]);
export function validateResetTarget(
  connectionString: string | undefined,
  expectedDatabase: string | undefined,
) {
  if (!connectionString || !expectedDatabase)
    throw new Error('Provide DATABASE_URL and --database <exact-database-name>.');
  const target = new URL(connectionString);
  const database = decodeURIComponent(target.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !database ||
    ['postgres', 'template0', 'template1'].includes(database) ||
    database !== expectedDatabase
  )
    throw new Error('Database target does not match the explicit CRM database name.');
  return { database, host: target.hostname };
}
export function quoteTable(name: string) {
  return `public."${name.replaceAll('"', '""')}"`;
}

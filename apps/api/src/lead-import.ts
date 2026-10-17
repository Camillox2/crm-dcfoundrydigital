import { createHash } from 'node:crypto';
import {
  CreateWorkspaceLeadSchema,
  normalizePhoneE164,
  permittedAttribution,
} from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import type { CrmPool } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
export function parseLeadCsv(text: string) {
  if (Buffer.byteLength(text) > 1_000_000)
    throw new WorkspaceError(400, 'O CSV deve ter no máximo 1 MB.');
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] ?? '',
    separator = first.includes(';') ? ';' : ',',
    rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell) throw new WorkspaceError(400, 'Aspas inválidas no CSV.');
      else {
        quoted = !quoted;
        closed = !quoted;
      }
    } else if (char === separator && !quoted) {
      row.push(cell);
      cell = '';
      closed = false;
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
      closed = false;
      if (rows.length > 501)
        throw new WorkspaceError(400, 'Importe no máximo 500 contatos por lote.');
    } else {
      if (closed && !/\s/.test(char))
        throw new WorkspaceError(400, 'Conteúdo inválido após aspas no CSV.');
      cell += char;
      if (cell.length > 12000) throw new WorkspaceError(400, 'Um campo do CSV é muito longo.');
    }
  }
  if (quoted) throw new WorkspaceError(400, 'Há aspas abertas no CSV.');
  if (cell || row.length) {
    row.push(cell);
    if (row.some((v) => v.trim())) rows.push(row);
  }
  const headers = rows.shift()?.map((v) => v.trim().toLowerCase()) ?? [];
  const aliases: Record<string, string> = {
    nome: 'name',
    empresa: 'company',
    telefone: 'phone',
    objetivo: 'scopeSummary',
    notas: 'notes',
    campanha: 'campaign',
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
    utm_term: 'utmTerm',
    utm_content: 'utmContent',
    consentimento_ads: 'adConsent',
  };
  const fields = headers.map((h) => aliases[h] ?? h);
  if (
    !['name', 'company', 'phone'].every((h) => fields.includes(h)) ||
    new Set(fields).size !== fields.length
  )
    throw new WorkspaceError(400, 'Inclua nome, empresa e telefone, sem colunas repetidas.');
  if (!rows.length || rows.length > 500)
    throw new WorkspaceError(400, 'O CSV deve conter de 1 a 500 contatos.');
  const seen = new Set<string>();
  return rows.map((values, i) => {
    const record = Object.fromEntries(
        fields.map((name, index) => [name, values[index]?.trim() ?? '']),
      ),
      parsed = CreateWorkspaceLeadSchema.safeParse(record);
    if (values.length !== fields.length || !parsed.success)
      return {
        row: i + 2,
        error: !parsed.success
          ? parsed.error.issues[0]?.message
          : 'Número de colunas diferente do cabeçalho.',
      };
    try {
      const data = { ...parsed.data, phone: normalizePhoneE164(parsed.data.phone) },
        attribution = permittedAttribution(record),
        duplicate = seen.has(data.phone);
      seen.add(data.phone);
      return { row: i + 2, data, attribution, duplicate };
    } catch {
      return { row: i + 2, error: 'Confira o telefone e os campos de atribuição.' };
    }
  });
}
export async function previewLeadCsv(pool: CrmPool, actor: WorkspaceActor, text: string) {
  const rows = parseLeadCsv(text);
  for (const row of rows) {
    if (!row.data || row.duplicate) continue;
    const found = (
      await pool.query(
        'SELECT l.id FROM workspace_leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.phone=$1 AND ($2::boolean OR l.owner_id=$3 OR ($4::boolean AND u.team_id=$5)) LIMIT 1',
        [row.data.phone, actor.scope === 'all', actor.id, actor.scope === 'team', actor.teamId],
      )
    ).rows[0];
    if (found) row.duplicate = true;
  }
  return {
    rows,
    valid: rows.filter((r) => r.data && !r.duplicate).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    errors: rows.filter((r) => r.error).map((r) => ({ row: r.row, message: r.error })),
    hash: createHash('sha256').update(text).digest('hex'),
  };
}
export async function persistAttribution(
  client: Pick<CrmPool, 'query'>,
  leadId: string,
  value: unknown,
) {
  const a = permittedAttribution(value);
  await client.query(
    "UPDATE workspace_leads SET utm_source=$2,utm_medium=$3,utm_campaign=$4,utm_term=$5,utm_content=$6,gclid=$7,ad_consent=$8::text,ad_consent_at=CASE WHEN $8::text<>'unknown' THEN now() ELSE NULL END,attribution_captured_at=now() WHERE id=$1",
    [
      leadId,
      a.utmSource,
      a.utmMedium,
      a.utmCampaign,
      a.utmTerm,
      a.utmContent,
      a.gclid,
      a.adConsent,
    ],
  );
}

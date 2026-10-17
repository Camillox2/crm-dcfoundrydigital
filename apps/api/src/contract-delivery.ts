import nodemailer from 'nodemailer';
import type { CrmPool } from './agency-access.js';
import { unseal } from './private-fields.js';
import { WorkspaceError } from './module-store.js';
export interface ContractMailer {
  send(input: {
    to: string;
    subject: string;
    text: string;
    messageId: string;
  }): Promise<{ accepted?: unknown[] }>;
}
export function contractUrl(token: string) {
  const raw = process.env.API_URL ?? process.env.WEB_URL;
  if (!raw) throw new WorkspaceError(503, 'Configure API_URL com o domínio público do CRM.');
  const base = new URL(raw);
  if (
    base.username ||
    base.password ||
    (base.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(base.hostname)
      ))
  )
    throw new WorkspaceError(503, 'API_URL deve usar o domínio HTTPS do CRM.');
  return new URL('/assinar/' + token, base).href;
}
export function smtpMailer(): ContractMailer | undefined {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return undefined;
  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { minVersion: 'TLSv1.2' },
  });
  return { send: (input) => transport.sendMail({ ...input, from: process.env.SMTP_FROM }) };
}
export async function flushContractDeliveries(pool: CrmPool, mailer: ContractMailer | undefined) {
  if (!mailer) return;
  for (let batch = 0; batch < 5; batch++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (
        await client.query(
          `SELECT d.*,c.title,c.company_name,c.client_name,c.token_ciphertext,c.status AS contract_status FROM contract_deliveries d JOIN service_contracts c ON c.id=d.contract_id WHERE d.channel='email' AND d.status='queued' AND d.next_attempt_at<=now() AND d.attempts<5 ORDER BY d.created_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
        )
      ).rows[0];
      if (!row) {
        await client.query('COMMIT');
        return;
      }
      if (row.contract_status === 'cancelled') {
        await client.query("UPDATE contract_deliveries SET status='cancelled' WHERE id=$1", [
          row.id,
        ]);
        await client.query('COMMIT');
        continue;
      }
      try {
        const url = contractUrl(unseal(row.token_ciphertext)),
          result = await mailer.send({
            to: row.recipient,
            subject: `${row.company_name} — ${row.title}`,
            text: `Olá, ${row.client_name}.\n\nConfira o contrato e suas evidências no link individual:\n${url}\n\nO documento está marcado como modelo, revisar com advogado. Revise o escopo e as condições antes do aceite.\n\n${row.company_name}`,
            messageId: `<contract-${row.id}@${new URL(url).hostname}>`,
          });
        if (!result.accepted?.length) throw new Error('SMTP did not accept recipient');
        await client.query(
          "UPDATE contract_deliveries SET status='smtp_accepted',attempts=attempts+1,sent_at=now() WHERE id=$1",
          [row.id],
        );
      } catch {
        await client.query(
          "UPDATE contract_deliveries SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'queued' END,next_attempt_at=now()+(power(2,attempts+1)*30)*interval '1 second' WHERE id=$1",
          [row.id],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

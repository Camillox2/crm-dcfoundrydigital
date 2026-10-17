import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ContractData, ContractTerms } from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import type { CrmPool } from './agency-access.js';
import { readCompany } from './company-settings.js';
import { TypedModuleStore } from './typed-module-store.js';
import { renderServiceContract } from './service-contract-template.js';
import { seal, unseal } from './private-fields.js';
import { WorkspaceError } from './module-store.js';
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const access = `($2::boolean OR c.owner_id=$3::uuid OR ($4::boolean AND c.owner_id IN(SELECT id FROM users WHERE team_id=$5::uuid)))`;
export class ServiceContractStore {
  constructor(public pool: CrmPool) {}
  async get(id: string, a: WorkspaceActor) {
    const row = (
      await this.pool.query(`SELECT c.* FROM service_contracts c WHERE c.id=$1 AND ${access}`, [
        id,
        a.scope === 'all',
        a.id,
        a.scope === 'team',
        a.teamId,
      ])
    ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Contrato indisponível ou sem permissão.');
    return row;
  }
  async list(a: WorkspaceActor) {
    return (
      await this.pool.query(
        `SELECT c.id,c.title,c.lead_id,c.proposal_id,c.proposal_version,c.service_type,c.status,c.value_cents,c.billing,c.client_name,c.client_email,c.company_name,c.document_hash,c.created_at FROM service_contracts c WHERE ${access.replaceAll('$2', '$1').replaceAll('$3', '$2').replaceAll('$4', '$3').replaceAll('$5', '$4')} ORDER BY c.created_at DESC LIMIT 200`,
        [a.scope === 'all', a.id, a.scope === 'team', a.teamId],
      )
    ).rows;
  }
  async generate(a: WorkspaceActor, input: ContractTerms) {
    const proposal = await new TypedModuleStore(this.pool).get(input.proposalId, 'contract', a),
      data = proposal.data as ContractData;
    input = {
      ...input,
      upfrontCents: data.upfrontCents,
      installments: data.installments,
      paymentDay: data.paymentDay,
      serviceType: data.serviceType,
    };
    if (proposal.version !== input.proposalVersion)
      throw new WorkspaceError(
        409,
        'A proposta mudou. Confira a versão antes de gerar o contrato.',
      );
    if (proposal.archivedAt || !['accepted', 'active'].includes(data.status) || !proposal.leadId)
      throw new WorkspaceError(409, 'Use uma proposta aceita e vinculada ao cliente.');
    if (!data.clientDocument || data.clientAddress.length < 10)
      throw new WorkspaceError(
        400,
        'Preencha documento e endereço do cliente na proposta antes de gerar o contrato.',
      );
    if (data.valueCents <= 0 || input.upfrontCents > data.valueCents)
      throw new WorkspaceError(
        400,
        'Confira o valor aceito e a entrada, que não pode superar o total.',
      );
    const company = await readCompany(this.pool);
    if (!company)
      throw new WorkspaceError(
        409,
        'Cadastre a identidade da contratada em Configurações. CPF é aceito; CNPJ não é obrigatório.',
      );
    const id = randomUUID(),
      token = randomBytes(32).toString('hex'),
      plain = renderServiceContract(
        id,
        company,
        data,
        input,
        proposal.version,
        new Date().toISOString(),
      ),
      hash = sha256(plain),
      client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = (
        await client.query('SELECT version,status FROM agency_proposals WHERE id=$1 FOR UPDATE', [
          proposal.id,
        ])
      ).rows[0];
      if (current.version !== proposal.version || !['accepted', 'active'].includes(current.status))
        throw new WorkspaceError(
          409,
          'A proposta foi alterada durante a geração. Atualize a tela.',
        );
      if (
        (
          await client.query(
            'SELECT id FROM service_contracts WHERE proposal_id=$1 AND proposal_version=$2',
            [proposal.id, proposal.version],
          )
        ).rows.length
      )
        throw new WorkspaceError(409, 'Já existe um contrato para esta versão da proposta.');
      await client.query(
        `INSERT INTO service_contracts(id,owner_id,lead_id,proposal_id,proposal_version,title,service_type,document_ciphertext,document_hash,client_document_ciphertext,client_email,client_name,company_name,company_document_ciphertext,provider_representative,token_hash,token_ciphertext,token_expires_at,value_cents,billing) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()+interval '7 days',$18,$19)`,
        [
          id,
          proposal.ownerId,
          proposal.leadId,
          proposal.id,
          proposal.version,
          data.title,
          input.serviceType,
          seal(plain),
          hash,
          seal(data.clientDocument),
          data.clientEmail,
          data.client,
          company.name,
          seal(company.document),
          company.representative,
          sha256(token),
          seal(token),
          data.valueCents,
          data.billing,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'contract.generated','service_contract',$2,$3)`,
        [
          a.id,
          id,
          JSON.stringify({
            proposalId: proposal.id,
            proposalVersion: proposal.version,
            documentHash: hash,
            serviceType: input.serviceType,
          }),
        ],
      );
      await client.query('COMMIT');
      return { id, documentHash: hash };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async publicDocument(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new WorkspaceError(404, 'Link indisponível.');
    const row = (
      await this.pool.query(
        'SELECT * FROM service_contracts WHERE token_hash=$1 AND token_expires_at>now()',
        [sha256(token)],
      )
    ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Link indisponível ou expirado.');
    return row;
  }
  async detail(row: Record<string, any>, fullEvidence = false) {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      documentHash: row.document_hash,
      text: unseal(row.document_ciphertext),
      signatures: (
        await this.pool.query(
          `SELECT party,signer_name,signed_at,document_hash,evidence_hash${fullEvidence ? ',ip_address,user_agent' : ''} FROM contract_signatures WHERE contract_id=$1 ORDER BY signed_at`,
          [row.id],
        )
      ).rows,
    };
  }
  async sign(
    row: Record<string, any>,
    party: 'client' | 'provider',
    input: { name: string; document: string; documentHash: string },
    ip: string,
    ua: string,
    actorId: string | null,
  ) {
    ip = ip.slice(0, 64);
    ua = ua.slice(0, 500);
    if (input.documentHash !== row.document_hash)
      throw new WorkspaceError(409, 'O documento apresentado não corresponde ao contrato atual.');
    const expected = unseal(
      party === 'client' ? row.client_document_ciphertext : row.company_document_ciphertext,
    );
    if (input.document !== expected)
      throw new WorkspaceError(400, 'O documento informado não corresponde à parte que assina.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = (
        await client.query('SELECT * FROM service_contracts WHERE id=$1 FOR UPDATE', [row.id])
      ).rows[0];
      if (current.status === 'cancelled')
        throw new WorkspaceError(409, 'O contrato foi cancelado.');
      if (
        party === 'client' &&
        (current.token_hash !== row.token_hash ||
          new Date(current.token_expires_at).getTime() <= Date.now())
      )
        throw new WorkspaceError(410, 'O link expirou. Solicite outro à equipe.');
      const previous = (
        await client.query(
          'SELECT signer_name FROM contract_signatures WHERE contract_id=$1 AND party=$2',
          [row.id, party],
        )
      ).rows[0];
      if (previous) {
        if (previous.signer_name !== input.name)
          throw new WorkspaceError(409, 'Esta parte já assinou o documento.');
        await client.query('COMMIT');
        return { signed: true };
      }
      const at = new Date((await client.query('SELECT now() AS time')).rows[0].time).toISOString(),
        documentHash = sha256(input.document),
        evidenceHash = sha256(
          JSON.stringify({
            contractId: row.id,
            party,
            name: input.name,
            signerDocumentHash: documentHash,
            documentHash: row.document_hash,
            ip,
            ua,
            signedAt: at,
          }),
        );
      await client.query(
        'INSERT INTO contract_signatures(contract_id,party,signer_name,signer_document_hash,ip_address,user_agent,document_hash,evidence_hash,actor_id,signed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          row.id,
          party,
          input.name,
          documentHash,
          ip.slice(0, 64),
          ua.slice(0, 500),
          row.document_hash,
          evidenceHash,
          actorId,
          at,
        ],
      );
      await client.query(
        `UPDATE service_contracts SET status=CASE WHEN (SELECT count(*) FROM contract_signatures WHERE contract_id=$1)=2 THEN 'signed' WHEN EXISTS(SELECT 1 FROM contract_signatures WHERE contract_id=$1 AND party='client') THEN 'client_signed' ELSE 'issued' END WHERE id=$1`,
        [row.id],
      );
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES($1,$2,'contract.signed','service_contract',$3,$4)`,
        [
          actorId ? 'user' : 'webhook',
          actorId,
          row.id,
          JSON.stringify({ party, documentHash: row.document_hash, evidenceHash, signedAt: at }),
        ],
      );
      await client.query('COMMIT');
      return { signed: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

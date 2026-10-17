import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function parseMasterKey(masterKeyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error('ENCRYPTION_MASTER_KEY_HEX deve possuir exatamente 64 caracteres hexadecimais (32 bytes).');
  }
  return Buffer.from(masterKeyHex, 'hex');
}

/**
 * Criptografa dados sensíveis em repouso (Art. 11 LGPD — dados clínicos/saúde e credenciais Baileys)
 * usando AES-256-GCM autenticado.
 */
export function encryptSensitiveField(
  plaintext: string,
  masterKeyHex: string,
  keyVersion = 1,
): EncryptedPayload {
  const key = parseMasterKey(masterKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion,
  };
}

/**
 * Descriptografa um payload AES-256-GCM autenticado.
 */
export function decryptSensitiveField(
  payload: EncryptedPayload,
  masterKeyHex: string,
): string {
  const key = parseMasterKey(masterKeyHex);
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const encryptedText = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Minimização de dados pessoais (LGPD Art. 6º, III) antes de enviar contexto ao LLM externo.
 * Mascara CPF, CNPJ, e-mail e telefones no texto.
 */
export function maskPiiForLlm(input: string): string {
  return input
    // Mascara CPF (000.000.000-00 ou 11 dígitos)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_MASCARADO]')
    // Mascara CNPJ
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_MASCARADO]')
    // Mascara e-mails
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_MASCARADO]')
    // Mascara telefones brasileiros (+55 ou DDD + número)
    .replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g, '[TELEFONE_MASCARADO]');
}

/**
 * Hash SHA-256 normalizado exigido pelo Google Ads Enhanced Conversions for Leads.
 */
export function hashForEnhancedConversions(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

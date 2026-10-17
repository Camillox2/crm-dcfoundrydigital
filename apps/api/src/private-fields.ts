import {
  encryptSensitiveField,
  decryptSensitiveField,
  type EncryptedPayload,
} from '@dcfoundry/shared';
import { WorkspaceError } from './module-store.js';
function masterKey() {
  const key = process.env.ENCRYPTION_MASTER_KEY_HEX;
  if (
    !key ||
    !/^[a-f0-9]{64}$/i.test(key) ||
    (process.env.NODE_ENV === 'production' && key.startsWith('0123456789abcdef'))
  )
    throw new WorkspaceError(
      503,
      'Configure ENCRYPTION_MASTER_KEY_HEX com uma chave própria de 32 bytes antes de salvar documentos.',
    );
  return key;
}
export function seal(value: string) {
  return value ? JSON.stringify(encryptSensitiveField(value, masterKey())) : '';
}
export function unseal(value: string) {
  if (!value) return '';
  try {
    return decryptSensitiveField(JSON.parse(value) as EncryptedPayload, masterKey());
  } catch {
    throw new WorkspaceError(
      503,
      'Não foi possível abrir o documento privado. Confira a chave de criptografia do servidor.',
    );
  }
}

/**
 * Minimização de dados pessoais (LGPD Art. 6º, III) antes de enviar contexto ao LLM externo.
 * Mascara CPF, CNPJ, e-mail e telefones no texto. (100% isomórfico browser + Node)
 */
export function maskPiiForLlm(input: string): string {
  return input
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_MASCARADO]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_MASCARADO]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_MASCARADO]')
    .replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g, '[TELEFONE_MASCARADO]');
}

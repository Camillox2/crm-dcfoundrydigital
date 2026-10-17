/**
 * Normaliza números de telefone para o padrão internacional E.164 (ex.: +5511999998888),
 * garantindo deduplicação de contatos e compatibilidade com Baileys e Google Ads.
 */
export function normalizePhoneE164(raw: string, defaultCountryCode = '55'): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Número de telefone inválido: nenhum dígito encontrado.');
  }

  const withoutLeadingZeros = digits.replace(/^0+/, '');

  if (withoutLeadingZeros.startsWith(defaultCountryCode) && withoutLeadingZeros.length >= 12) {
    return `+${withoutLeadingZeros}`;
  }

  if (withoutLeadingZeros.length === 10 || withoutLeadingZeros.length === 11) {
    return `+${defaultCountryCode}${withoutLeadingZeros}`;
  }

  if (raw.trim().startsWith('+')) {
    return `+${withoutLeadingZeros}`;
  }

  return `+${defaultCountryCode}${withoutLeadingZeros}`;
}

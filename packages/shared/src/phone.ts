/**
 * Normaliza números de telefone para o padrão internacional E.164 (ex.: +5511999998888),
 * garantindo deduplicação de contatos e compatibilidade com Baileys e Google Ads.
 */
export function normalizePhoneE164(raw: string, defaultCountryCode = '55'): string {
  const input = raw.trim();
  if (!/^\+?[\d().\s-]+$/.test(input) || !/^[1-9]\d{0,2}$/.test(defaultCountryCode))
    throw new Error('Número de telefone inválido.');
  const digits = input.replace(/\D/g, '');
  const international = input.startsWith('+') || input.startsWith('00');
  const number = input.startsWith('00')
    ? digits.slice(2)
    : international
      ? digits
      : digits.replace(/^0+/, '');
  const normalized =
    international || (number.startsWith(defaultCountryCode) && number.length >= 12)
      ? '+' + number
      : number.length === 10 || number.length === 11
        ? '+' + defaultCountryCode + number
        : '';
  if (!/^\+[1-9]\d{7,14}$/.test(normalized))
    throw new Error('Número de telefone inválido: use DDD e DDI.');
  return normalized;
}

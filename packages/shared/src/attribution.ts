import { z } from 'zod';
const value = z.string().trim().max(200).default('');
export const AttributionInput = z.object({
  utmSource: value,
  utmMedium: value,
  utmCampaign: value,
  utmTerm: value,
  utmContent: value,
  gclid: z
    .string()
    .trim()
    .max(512)
    .regex(/^[A-Za-z0-9_.~-]*$/)
    .default(''),
  adConsent: z.enum(['unknown', 'granted', 'denied']).default('unknown'),
});
export type AttributionData = z.infer<typeof AttributionInput>;
export function permittedAttribution(value: unknown) {
  const data = AttributionInput.parse(value);
  return { ...data, gclid: data.adConsent === 'granted' ? data.gclid : '' };
}

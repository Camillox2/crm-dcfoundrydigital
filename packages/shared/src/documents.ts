import { z } from 'zod';
export const normalizeDocument = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[.\-/\s]/g, '');
export function validCpfCnpj(raw: string) {
  const value = normalizeDocument(raw);
  if (/^(\d)\1+$/.test(value)) return false;
  if (/^\d{11}$/.test(value)) {
    const digit = (length: number) => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
  }
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value)) return false;
  const digit = (body: string) => {
    let weight = 2,
      sum = 0;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += (body.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(value.slice(0, 12));
  return first === Number(value[12]) && digit(value.slice(0, 12) + first) === Number(value[13]);
}
export const DocumentInput = z
  .string()
  .trim()
  .refine(validCpfCnpj, 'Informe um CPF ou CNPJ válido.')
  .transform(normalizeDocument);
export const optionalDocument = z.union([DocumentInput, z.literal('')]).default('');
export const CompanyInput = z.object({
  name: z.string().trim().min(2).max(180),
  document: DocumentInput,
  address: z.string().trim().min(10).max(1000),
  email: z.string().email().max(254),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Informe telefone com DDI, como +55…'),
  representative: z.string().trim().min(2).max(180),
  version: z.number().int().min(0),
});
export const ServiceType = z.enum(['site_landing', 'system_app', 'paid_marketing', 'maintenance']);
export const ContractGenerationInput = z.object({
  proposalId: z.string().uuid(),
  proposalVersion: z.number().int().positive(),
  serviceType: ServiceType,
  timeline: z.string().trim().min(10).max(5000),
  deliverables: z.string().trim().min(10).max(5000),
  outOfScope: z.string().trim().min(10).max(5000),
  revisionsIncluded: z.number().int().min(0).max(20).default(2),
  extraRevisionCents: z.number().int().min(0).max(1e9).default(0),
  upfrontCents: z.number().int().min(0).max(1e11).default(0),
  installments: z.number().int().min(1).max(60).default(1),
  paymentDay: z.number().int().min(1).max(28).default(10),
  paymentTerms: z.string().trim().min(5).max(3000),
  latePenaltyPercent: z.number().min(0).max(2).default(2),
  monthlyInterestPercent: z.number().min(0).max(2).default(1),
  adjustmentIndex: z.enum(['IPCA', 'IGP-M', 'sem reajuste']).default('IPCA'),
  hostingPayer: z.enum(['client', 'provider']).default('client'),
  domainPayer: z.enum(['client', 'provider']).default('client'),
  toolsPayer: z.enum(['client', 'provider']).default('client'),
  warrantyDays: z.number().int().min(0).max(365).default(90),
  supportResponseHours: z.number().int().min(1).max(168).default(8),
  noticeDays: z.number().int().min(1).max(90).default(30),
});
export type ContractTerms = z.infer<typeof ContractGenerationInput>;

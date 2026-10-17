import { z } from 'zod';

// ============================================================================
// 1. SNIPPET DE CAPTURA, CONSENT MODE V2 & DECORAÇÃO DE LINK WHATSAPP (SEÇÃO 6)
// ============================================================================

export interface AttributionTouchpoint {
  trackingCode: string; // ex: "DCF-9A4F"
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
  capturedAtIso: string;
}

export interface ConsentModeV2State {
  ad_storage: 'granted' | 'denied';
  analytics_storage: 'granted' | 'denied';
  ad_user_data: 'granted' | 'denied';
  ad_personalization: 'granted' | 'denied';
}

export const DEFAULT_CONSENT_MODE_V2: ConsentModeV2State = {
  ad_storage: 'granted',
  analytics_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'denied', // Negado por padrão conforme especificação LGPD
};

/**
 * Extrai parâmetros UTM, gclid, gbraid, wbraid e fbclid de uma URL de entrada.
 */
export function parseTouchpointFromUrl(
  rawUrl: string,
  trackingCode: string,
  referrer?: string,
): AttributionTouchpoint {
  const url = new URL(rawUrl, 'https://dcfoundrydigital.com');
  const p = url.searchParams;

  return {
    trackingCode,
    utmSource: p.get('utm_source') ?? undefined,
    utmMedium: p.get('utm_medium') ?? undefined,
    utmCampaign: p.get('utm_campaign') ?? undefined,
    utmTerm: p.get('utm_term') ?? undefined,
    utmContent: p.get('utm_content') ?? undefined,
    gclid: p.get('gclid') ?? undefined,
    gbraid: p.get('gbraid') ?? undefined,
    wbraid: p.get('wbraid') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
    landingPage: url.pathname + url.search,
    referrer,
    capturedAtIso: new Date().toISOString(),
  };
}

/**
 * Anexa o código curto de rastreio [DCF-XXXX] na mensagem pré-preenchida de links wa.me / api.whatsapp.com.
 */
export function decorateWhatsAppLinkWithTrackingCode(
  whatsappUrl: string,
  trackingCode: string,
): string {
  const url = new URL(whatsappUrl);
  const currentText = url.searchParams.get('text') ?? 'Olá! Gostaria de falar com a DC Foundry Digital.';
  if (!currentText.includes(`[${trackingCode}]`)) {
    url.searchParams.set('text', `${currentText} [Ref: ${trackingCode}]`);
  }
  return url.toString();
}

/**
 * Extrai o código curto [Ref: DCF-XXXX] ou [DCF-XXXX] quando a mensagem chega no Baileys.
 */
export function extractTrackingCodeFromMessage(messageText: string): string | null {
  const match = messageText.match(/\[(?:Ref:\s*)?(DCF-[A-Z0-9]{4,12})\]/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

// ============================================================================
// 2. MODELOS DE ATRIBUIÇÃO (FIRST TOUCH, LAST TOUCH E LINEAR)
// ============================================================================

export type AttributionModel = 'first_touch' | 'last_touch' | 'linear';

export interface CampaignCreditShare {
  campaign: string;
  gclid?: string;
  weight: number;
  attributedValueCents: number;
}

export function calculateAttributionShares(
  touchpoints: readonly AttributionTouchpoint[],
  totalValueCents: number,
  model: AttributionModel = 'last_touch',
): CampaignCreditShare[] {
  if (touchpoints.length === 0) {
    return [
      {
        campaign: 'Direto / Orgânico',
        weight: 1,
        attributedValueCents: totalValueCents,
      },
    ];
  }

  if (model === 'first_touch') {
    const first = touchpoints[0]!;
    return [
      {
        campaign: first.utmCampaign ?? (first.gclid ? 'Google Ads (gclid)' : 'Orgânico'),
        gclid: first.gclid,
        weight: 1,
        attributedValueCents: totalValueCents,
      },
    ];
  }

  if (model === 'last_touch') {
    const last = touchpoints[touchpoints.length - 1]!;
    return [
      {
        campaign: last.utmCampaign ?? (last.gclid ? 'Google Ads (gclid)' : 'Orgânico'),
        gclid: last.gclid,
        weight: 1,
        attributedValueCents: totalValueCents,
      },
    ];
  }

  // Modelo Linear: divide o crédito igualmente entre todos os pontos de contato
  const weight = Number((1 / touchpoints.length).toFixed(4));
  const shareValue = Math.round(totalValueCents / touchpoints.length);

  return touchpoints.map((tp) => ({
    campaign: tp.utmCampaign ?? (tp.gclid ? 'Google Ads (gclid)' : 'Orgânico'),
    gclid: tp.gclid,
    weight,
    attributedValueCents: shareValue,
  }));
}

// ============================================================================
// 3. UPLOAD DE CONVERSÕES OFFLINE GOOGLE ADS & DASHBOARD DE ROI/CPL/CAC/ROAS
// ============================================================================

export const OfflineConversionJobSchema = z.object({
  leadId: z.string(),
  contractId: z.string().optional(),
  conversionName: z.enum(['lead_qualificado', 'contrato_fechado']),
  gclid: z.string().min(4),
  hashedEmailSha256: z.string().length(64).optional(),
  hashedPhoneSha256: z.string().length(64).optional(),
  conversionValueCents: z.number().int().nonnegative(),
  currencyCode: z.string().default('BRL'),
  conversionDateTime: z.string(),
});

export type OfflineConversionJob = z.infer<typeof OfflineConversionJobSchema>;

export interface CampaignRoiInput {
  campaignId: string;
  campaignName: string;
  costCents: number;
  clicks: number;
  totalLeads: number;
  qualifiedLeads: number;
  closedContracts: number;
  revenueCents: number;
}

export interface CampaignRoiMetrics extends CampaignRoiInput {
  cplCents: number;
  costPerQualifiedLeadCents: number;
  cacCents: number;
  leadToContractRatePercent: number;
  roasMultiplier: number;
  roiPercent: number;
}

/**
 * Calcula CPL, Custo por Lead Qualificado, CAC, Taxa de Conversão e ROAS/ROI por campanha.
 */
export function calculateCampaignRoiMetrics(input: CampaignRoiInput): CampaignRoiMetrics {
  const cplCents = input.totalLeads > 0 ? Math.round(input.costCents / input.totalLeads) : 0;
  const costPerQualifiedLeadCents =
    input.qualifiedLeads > 0 ? Math.round(input.costCents / input.qualifiedLeads) : 0;
  const cacCents =
    input.closedContracts > 0 ? Math.round(input.costCents / input.closedContracts) : 0;
  const leadToContractRatePercent =
    input.totalLeads > 0
      ? Number(((input.closedContracts / input.totalLeads) * 100).toFixed(2))
      : 0;
  const roasMultiplier =
    input.costCents > 0 ? Number((input.revenueCents / input.costCents).toFixed(2)) : 0;
  const roiPercent =
    input.costCents > 0
      ? Number((((input.revenueCents - input.costCents) / input.costCents) * 100).toFixed(1))
      : 0;

  return {
    ...input,
    cplCents,
    costPerQualifiedLeadCents,
    cacCents,
    leadToContractRatePercent,
    roasMultiplier,
    roiPercent,
  };
}

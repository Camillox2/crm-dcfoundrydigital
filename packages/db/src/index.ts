import { ROLE_PERMISSIONS_MATRIX, type RoleName } from '@dcfoundry/shared';

export interface SeedEquipmentCatalogItem {
  sku: string;
  name: string;
  category: 'bed' | 'mattress' | 'wheelchair' | 'oxygen' | 'accessory';
  salePriceCents: number;
  dailyRentalCents: number;
  weeklyRentalCents: number;
  monthlyRentalCents: number;
  depositCautionCents: number;
  units: Array<{ serialNumber: string; assetTag: string; status: 'available' | 'rented' | 'maintenance' | 'sanitization' }>;
}

/**
 * Dados iniciais (Seeds) de papéis RBAC e Catálogo de Soluções & Infraestrutura DC Foundry Digital
 */
export const INITIAL_ROLES_SEED = (Object.keys(ROLE_PERMISSIONS_MATRIX) as RoleName[]).map((slug) => ({
  slug,
  displayName: slug.charAt(0).toUpperCase() + slug.slice(1),
  permissionsJson: ROLE_PERMISSIONS_MATRIX[slug],
}));

export const INITIAL_EQUIPMENT_CATALOG_SEED: SeedEquipmentCatalogItem[] = [
  {
    sku: 'DCF-SQUAD-PRO',
    name: 'Squad Dedicada Full-Stack & IA (Retainer Mensal)',
    category: 'bed',
    salePriceCents: 4800000,
    dailyRentalCents: 95000,
    weeklyRentalCents: 380000,
    monthlyRentalCents: 1250000,
    depositCautionCents: 0,
    units: [
      { serialNumber: 'SN-SQD-2026-001', assetTag: 'SQUAD-ALPHA', status: 'available' },
      { serialNumber: 'SN-SQD-2026-002', assetTag: 'SQUAD-BETA', status: 'rented' },
      { serialNumber: 'SN-SQD-2026-003', assetTag: 'SQUAD-GAMMA', status: 'available' },
    ],
  },
  {
    sku: 'DCF-AI-AGENT-WA',
    name: 'Agente Autônomo WhatsApp + RAG pgvector (Instância Dedicada)',
    category: 'oxygen',
    salePriceCents: 1490000,
    dailyRentalCents: 25000,
    weeklyRentalCents: 95000,
    monthlyRentalCents: 290000,
    depositCautionCents: 0,
    units: [
      { serialNumber: 'SN-AIN-2026-010', assetTag: 'NODE-AI-01', status: 'available' },
      { serialNumber: 'SN-AIN-2026-011', assetTag: 'NODE-AI-02', status: 'rented' },
    ],
  },
  {
    sku: 'DCF-CLOUD-VPS',
    name: 'Cluster Cloud Dedicado High-Availability + CI/CD',
    category: 'mattress',
    salePriceCents: 890000,
    dailyRentalCents: 15000,
    weeklyRentalCents: 55000,
    monthlyRentalCents: 165000,
    depositCautionCents: 0,
    units: [
      { serialNumber: 'SN-CLD-2026-050', assetTag: 'SRV-KVM-01', status: 'available' },
    ],
  },
  {
    sku: 'DCF-ADS-ENGINE',
    name: 'Setup & Motor de Atribuição Google Ads Offline Conversions',
    category: 'accessory',
    salePriceCents: 750000,
    dailyRentalCents: 12000,
    weeklyRentalCents: 45000,
    monthlyRentalCents: 140000,
    depositCautionCents: 0,
    units: [
      { serialNumber: 'SN-ADS-2026-080', assetTag: 'ADS-PIPE-01', status: 'available' },
    ],
  },
];

export * from './schema.js';
export * from './client.js';
export * from './operations.js';

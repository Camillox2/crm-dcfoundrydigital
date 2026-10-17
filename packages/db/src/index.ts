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
 * Dados iniciais (Seeds) de papéis RBAC, funis e catálogo hospitalar / home care
 */
export const INITIAL_ROLES_SEED = (Object.keys(ROLE_PERMISSIONS_MATRIX) as RoleName[]).map((slug) => ({
  slug,
  displayName: slug.charAt(0).toUpperCase() + slug.slice(1),
  permissionsJson: ROLE_PERMISSIONS_MATRIX[slug],
}));

export const INITIAL_EQUIPMENT_CATALOG_SEED: SeedEquipmentCatalogItem[] = [
  {
    sku: 'CAMA-ELE-3M-01',
    name: 'Cama Hospitalar Motorizada 3 Movimentos (Fowler + Elevação)',
    category: 'bed',
    salePriceCents: 689000,
    dailyRentalCents: 4500,
    weeklyRentalCents: 19500,
    monthlyRentalCents: 49000,
    depositCautionCents: 30000,
    units: [
      { serialNumber: 'SN-EL3M-2026-001', assetTag: 'PAT-0001', status: 'available' },
      { serialNumber: 'SN-EL3M-2026-002', assetTag: 'PAT-0002', status: 'rented' },
      { serialNumber: 'SN-EL3M-2026-003', assetTag: 'PAT-0003', status: 'sanitization' },
    ],
  },
  {
    sku: 'CAMA-MAN-2M-01',
    name: 'Cama Hospitalar Manual 2 Manivelas com Grades Rebatíveis',
    category: 'bed',
    salePriceCents: 329000,
    dailyRentalCents: 2800,
    weeklyRentalCents: 12000,
    monthlyRentalCents: 29000,
    depositCautionCents: 20000,
    units: [
      { serialNumber: 'SN-MN2M-2026-010', assetTag: 'PAT-0010', status: 'available' },
      { serialNumber: 'SN-MN2M-2026-011', assetTag: 'PAT-0011', status: 'available' },
    ],
  },
  {
    sku: 'COL-PNEU-01',
    name: 'Colchão Pneumático Anti-Escaras com Compressor Silencioso',
    category: 'mattress',
    salePriceCents: 69000,
    dailyRentalCents: 1200,
    weeklyRentalCents: 5500,
    monthlyRentalCents: 13000,
    depositCautionCents: 10000,
    units: [
      { serialNumber: 'SN-CPNE-2026-050', assetTag: 'PAT-0050', status: 'available' },
    ],
  },
  {
    sku: 'CONC-O2-5L',
    name: 'Concentrador de Oxigênio Estacionário 5L/min',
    category: 'oxygen',
    salePriceCents: 495000,
    dailyRentalCents: 3900,
    weeklyRentalCents: 17000,
    monthlyRentalCents: 42000,
    depositCautionCents: 25000,
    units: [
      { serialNumber: 'SN-O25L-2026-080', assetTag: 'PAT-0080', status: 'available' },
    ],
  },
];

export * from './schema.js';
export * from './client.js';

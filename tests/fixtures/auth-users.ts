import { hashPassword } from '../../apps/api/src/plugins/auth.js';
import type { DemoUserRecord } from '../../apps/api/src/app.js';
export function fixtureUsers(): DemoUserRecord[] {
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'vitor@dcfoundrydigital.com',
      fullName: 'Vitor Henrique Camillo',
      passwordHash: hashPassword('DcFoundry#2026'),
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roles: ['admin'],
      totpEnabled: false,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'vendedor@dcfoundrydigital.com',
      fullName: 'Lucas Consultor Comercial',
      passwordHash: hashPassword('Vendedor#2026'),
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roles: ['vendedor'],
      totpEnabled: false,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'logistica@dcfoundrydigital.com',
      fullName: 'Marcos Logística',
      passwordHash: hashPassword('Logistica#2026'),
      teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      roles: ['logistica'],
      totpEnabled: false,
    },
  ];
}

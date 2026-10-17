import { it, expect } from 'vitest';
import { csvText } from '../apps/web/src/components/modules/useModule.js';

it('preserves Portuguese, quoted fields and nulls while neutralizing spreadsheet formulas', () => {
  const result = csvText([
    { nome: 'João; "DC"', formula: '=SUM(A1:A2)', valor: 1250.5, vazio: null },
  ]);
  expect(result).toBe(
    '\uFEFF"nome";"formula";"valor";"vazio"\r\n"João; ""DC""";"\'=SUM(A1:A2)";"1250.5";""',
  );
});

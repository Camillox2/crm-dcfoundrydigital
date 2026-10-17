import { expect, it } from 'vitest';
import { foundrySendDecision } from '../apps/worker/src/foundry-send-gate.js';
import { upsertIsHistorical } from '../apps/worker/src/whatsapp-session.js';

const control = { revision: 4, paused: false };

it('keeps an authorized Foundry send when the enable flag lapses and still honors a human takeover', () => {
  expect(foundrySendDecision({ enabled: '1', control, aiRevision: 4, handoffAck: false })).toBe(
    'send',
  );
  expect(foundrySendDecision({ enabled: null, control, aiRevision: '4', handoffAck: false })).toBe(
    'retry',
  );
  expect(foundrySendDecision({ enabled: '0', control, aiRevision: 4, handoffAck: false })).toBe(
    'drop',
  );
  expect(
    foundrySendDecision({
      enabled: '1',
      control: { revision: 5, paused: true },
      aiRevision: 5,
      handoffAck: true,
    }),
  ).toBe('send');
  expect(
    foundrySendDecision({
      enabled: '1',
      control: { revision: 5, paused: true },
      aiRevision: 5,
      handoffAck: false,
    }),
  ).toBe('drop');
  expect(
    foundrySendDecision({ enabled: '1', control: { revision: 6, paused: false }, aiRevision: 5 }),
  ).toBe('drop');
  expect(foundrySendDecision({ enabled: '1', control: null, aiRevision: 4 })).toBe('retry');
  expect(foundrySendDecision({ enabled: '0', control: null, aiRevision: 4 })).toBe('drop');
});

it('treats a recent offline WhatsApp upsert as live and leaves older history alone', () => {
  const now = Date.now();
  const recent = { messageTimestamp: Math.floor(now / 1000) - 60 };
  const old = { messageTimestamp: Math.floor(now / 1000) - 31 * 60 };
  expect(upsertIsHistorical('notify', old, now)).toBe(false);
  expect(upsertIsHistorical('append', recent, now)).toBe(false);
  expect(upsertIsHistorical('append', old, now)).toBe(true);
  expect(upsertIsHistorical('append', {}, now)).toBe(true);
});

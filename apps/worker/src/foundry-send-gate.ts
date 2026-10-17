export type FoundrySendDecision = 'send' | 'drop' | 'retry';

/**
 * The API already checked the global switch and the lead revision before publishing.
 * A missing flag is a gap between flushes, so the send waits. An explicit "0" or a
 * newer human revision still cancels the reply.
 */
export function foundrySendDecision(input: {
  enabled: string | null;
  control: { revision?: unknown; paused?: unknown } | null;
  aiRevision: unknown;
  handoffAck?: boolean;
}): FoundrySendDecision {
  if (!input.control) return input.enabled === '0' ? 'drop' : 'retry';
  const revision = Number(input.control.revision);
  const expected = Number(input.aiRevision);
  if (!Number.isFinite(revision) || !Number.isFinite(expected) || revision !== expected)
    return 'drop';
  if (input.control.paused === true && !input.handoffAck) return 'drop';
  if (input.enabled === '0') return 'drop';
  if (input.enabled === '1') return 'send';
  return 'retry';
}

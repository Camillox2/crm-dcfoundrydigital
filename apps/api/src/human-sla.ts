export type SlaMessage = {
  lead_id: string;
  channel: string;
  direction: string;
  actor_type: string;
  sent_at: string;
  delivery: string;
  historical?: boolean;
  sla_minutes: number;
  name?: string;
};
export function humanResponseSla(messages: SlaMessage[], now = Date.now()) {
  const sorted = messages
      .filter(
        (m) =>
          !m.historical && Number.isFinite(Date.parse(m.sent_at)) && Date.parse(m.sent_at) <= now,
      )
      .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at)),
    pending = new Map<string, SlaMessage>(),
    answered: { minutes: number; limit: number }[] = [];
  for (const m of sorted) {
    const key = m.channel + ':' + m.lead_id;
    if (m.direction === 'inbound') {
      if (!pending.has(key)) pending.set(key, m);
    } else if (
      m.actor_type === 'human' &&
      ['sent', 'delivered', 'read', 'received'].includes(m.delivery)
    ) {
      const waiting = pending.get(key);
      if (waiting) {
        answered.push({
          minutes: (Date.parse(m.sent_at) - Date.parse(waiting.sent_at)) / 60000,
          limit: waiting.sla_minutes,
        });
        pending.delete(key);
      }
    }
  }
  const times = answered.map((r) => r.minutes).sort((a, b) => a - b),
    pct = (p: number) =>
      times.length ? times[Math.max(0, Math.ceil(times.length * p) - 1)] : null;
  const waiting = [...pending.values()]
    .map((m) => ({
      leadId: m.lead_id,
      name: m.name ?? '',
      channel: m.channel,
      waitingMinutes: (now - Date.parse(m.sent_at)) / 60000,
      slaMinutes: m.sla_minutes,
    }))
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes);
  return {
    answered: times.length,
    withinSla: answered.filter((r) => r.minutes <= r.limit).length,
    medianMinutes: pct(0.5),
    p90Minutes: pct(0.9),
    averageMinutes: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    awaiting: waiting.length,
    overdue: waiting.filter((r) => r.waitingMinutes > r.slaMinutes).length,
    waiting: waiting.slice(0, 50),
  };
}

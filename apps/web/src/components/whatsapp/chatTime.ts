const zone = 'America/Sao_Paulo';

function parts(date: Date) {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map = new Map(format.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: map.get('year') ?? '0000',
    month: map.get('month') ?? '01',
    day: map.get('day') ?? '01',
    hour: map.get('hour') ?? '00',
    minute: map.get('minute') ?? '00',
  };
}

export function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const item = parts(date);
  return `${item.year}-${item.month}-${item.day}`;
}

export function dayLabel(value: string | Date, now = new Date()) {
  const key = dayKey(value);
  if (!key) return '';
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86400000));
  const item = parts(value instanceof Date ? value : new Date(value));
  const numeric = `${item.day}/${item.month}/${item.year}`;
  if (key === today) return `Hoje · ${numeric}`;
  if (key === yesterday) return `Ontem · ${numeric}`;
  return numeric;
}

export function shortTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const item = parts(date);
  return `${item.hour}:${item.minute}`;
}

export function fullDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const item = parts(date);
  return `${item.day}/${item.month}/${item.year} às ${item.hour}:${item.minute}`;
}

export function listTime(value: string | Date | null, now = new Date()) {
  if (!value) return '';
  const key = dayKey(value);
  if (key === dayKey(now)) return shortTime(value);
  if (key === dayKey(new Date(now.getTime() - 86400000))) return 'Ontem';
  const item = parts(value instanceof Date ? value : new Date(value));
  return `${item.day}/${item.month}/${item.year}`;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;
  return `+${digits.slice(0, 2)} ••••-${digits.slice(-4)}`;
}

export function waitLabel(iso: string | null | undefined, goalMinutes: number, now = Date.now()) {
  if (!iso) return null;
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return null;
  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  const text = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  const goal = goalMinutes > 0 ? goalMinutes : 30;
  const tone = minutes > goal ? 'late' : minutes >= goal * 0.8 ? 'wait' : 'ok';
  return {
    tone,
    minutes,
    label: tone === 'late' ? `SLA excedido · ${text}` : `Aguardando atendente · ${text}`,
  } as const;
}

export function isSameDay(value: string | Date, day: 'today' | 'yesterday', now = new Date()) {
  const key = dayKey(value);
  if (day === 'today') return key === dayKey(now);
  return key === dayKey(new Date(now.getTime() - 86400000));
}

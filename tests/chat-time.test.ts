import { describe, expect, it } from 'vitest';
import { dayLabel, isSameDay, listTime, maskPhone, shortTime, waitLabel } from '../apps/web/src/components/whatsapp/chatTime.ts';

const now = new Date('2026-10-17T15:00:00.000Z');

describe('chat time in America/Sao_Paulo', () => {
  it('labels today, yesterday and a short clock', () => {
    expect(dayLabel('2026-10-17T15:00:00.000Z', now)).toBe('Hoje · 17/10/2026');
    expect(dayLabel('2026-10-16T15:00:00.000Z', now)).toBe('Ontem · 16/10/2026');
    expect(dayLabel('2026-10-12T15:00:00.000Z', now)).toBe('12/10/2026');
    expect(shortTime('2026-10-17T15:32:00.000Z')).toBe('12:32');
    expect(listTime('2026-10-17T15:32:00.000Z', now)).toBe('12:32');
    expect(listTime('2026-10-16T15:00:00.000Z', now)).toBe('Ontem');
    expect(isSameDay('2026-10-17T02:30:00.000Z', 'today', now)).toBe(false);
  });

  it('masks phones and colors the wait against the SLA goal', () => {
    expect(maskPhone('+5541991112233')).toBe('+55 ••••-2233');
    expect(maskPhone('123')).toBe('123');
    expect(waitLabel(new Date(now.getTime() - 10 * 60000).toISOString(), 30, now.getTime())?.tone).toBe('ok');
    expect(waitLabel(new Date(now.getTime() - 25 * 60000).toISOString(), 30, now.getTime())?.tone).toBe('wait');
    const late = waitLabel(new Date(now.getTime() - 40 * 60000).toISOString(), 30, now.getTime());
    expect(late?.tone).toBe('late');
    expect(late?.label).toContain('SLA excedido');
    expect(waitLabel(null, 30, now.getTime())).toBeNull();
  });
});

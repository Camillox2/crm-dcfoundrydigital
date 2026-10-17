import { randomUUID } from 'node:crypto';

export const reserveSendScript = `
local time = redis.call('TIME')
local now = tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-60000)
if redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[1]) then
  local first = redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES')
  return math.max(1,tonumber(first[2])+60000-now)
end
redis.call('ZADD',KEYS[1],now,ARGV[2])
redis.call('PEXPIRE',KEYS[1],60000)
return 0
`;

/** Redis window survives restarts, covers retries and retains no customer data. */
export function createSendLimit(
  redis: { eval(script: string, count: number, ...args: Array<string | number>): Promise<unknown> },
  max = Number(process.env.WHATSAPP_SENDS_PER_MINUTE || 30),
) {
  if (!Number.isInteger(max) || max < 1 || max > 120)
    throw new Error('WHATSAPP_SENDS_PER_MINUTE must be between 1 and 120');
  return {
    async reserve() {
      const delay = Number(
        await redis.eval(reserveSendScript, 1, 'dc-wa-send-window', max, randomUUID()),
      );
      if (!Number.isFinite(delay) || delay < 0 || delay > 60000)
        throw new Error('Invalid WhatsApp rate window');
      return delay;
    },
  };
}

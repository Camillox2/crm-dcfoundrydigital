import { randomUUID } from 'node:crypto';

export interface LeaseRedis {
  set(key: string, value: string, px: 'PX', ttl: number, nx: 'NX'): Promise<unknown>;
  eval(script: string, count: number, ...args: Array<string | number>): Promise<unknown>;
}
const renew =
  "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end";
const release =
  "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";

/** A second process cannot consume commands or open Baileys while this owner is alive. */
export async function acquireWorkerLease(
  redis: LeaseRedis,
  onLost: () => void,
  {
    clock = Date.now,
    ttl = 30000,
    interval = 5000,
  }: { clock?: () => number; ttl?: number; interval?: number } = {},
) {
  const key = 'dc-wa-worker-owner',
    token = randomUUID();
  if ((await redis.set(key, token, 'PX', ttl, 'NX')) !== 'OK')
    throw new Error(
      'Another WhatsApp worker owns the session. Stop it before starting this worker.',
    );
  let deadline = clock() + ttl - interval,
    stopped = false,
    renewing = false;
  const lose = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    onLost();
  };
  const assertOwner = () => {
    if (stopped || clock() >= deadline) {
      lose();
      throw new Error('WhatsApp worker ownership expired');
    }
  };
  const refresh = async () => {
    assertOwner();
    if (renewing) return;
    renewing = true;
    try {
      const started = clock();
      if ((await redis.eval(renew, 1, key, token, ttl)) !== 1) throw new Error('Lease replaced');
      assertOwner();
      deadline = started + ttl - interval;
    } catch {
      lose();
    } finally {
      renewing = false;
    }
  };
  const timer = setInterval(() => {
    void refresh().catch(lose);
  }, interval);
  timer.unref();
  return {
    assertOwner,
    refresh,
    async close() {
      stopped = true;
      clearInterval(timer);
      await redis.eval(release, 1, key, token);
    },
  };
}

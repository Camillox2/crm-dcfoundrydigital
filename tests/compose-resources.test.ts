import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
it('keeps every Compose service bounded and preserves the existing public/loopback port boundary', async () => {
  const compose = parse(
    await readFile(new URL('../infra/docker-compose.yml', import.meta.url), 'utf8'),
  );
  const limits: Record<string, string> = {
    postgres: '512m',
    redis: '128m',
    api: '384m',
    worker: '384m',
    caddy: '96m',
  };
  expect(Object.keys(compose.services).sort()).toEqual(Object.keys(limits).sort());
  for (const [name, limit] of Object.entries(limits)) {
    expect(compose.services[name].mem_limit.toLowerCase()).toBe(limit);
    expect(compose.services[name].deploy.resources.limits.memory.toLowerCase()).toBe(limit);
  }
  expect(compose.services.worker.ports).toBeUndefined();
  expect(compose.services.worker.environment.NODE_OPTIONS).toContain('256');
  expect(compose.services.api.ports).toEqual(['127.0.0.1:4000:4000']);
  expect(compose.services.postgres.ports).toEqual(['127.0.0.1:5432:5432']);
  expect(compose.services.redis.ports).toEqual(['127.0.0.1:6379:6379']);
  expect(compose.services.caddy.ports).toEqual(['80:80', '443:443']);
  expect(compose.services.worker.volumes).toContain('whatsapp_sessions:/data/whatsapp');
  expect(compose.services.api.volumes).not.toContain('whatsapp_sessions:/data/whatsapp');
});

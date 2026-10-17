import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { directIdentity, type WhatsAppCommand, type WhatsAppEvent } from '@dcfoundry/shared';

export interface SessionSocket {
  ev: {
    on(name: string, callback: (...args: any[]) => void): void;
    removeAllListeners(name: string): void;
  };
  user?: { id: string };
  requestPairingCode(phone: string): Promise<string>;
  fetchMessageHistory(
    count: number,
    key: { id: string; remoteJid: string; fromMe: boolean },
    timestamp: number,
  ): Promise<unknown>;
  sendMessage(
    jid: string,
    content: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ key?: { id?: string | null } } | undefined>;
  profilePictureUrl(jid: string, type: 'image'): Promise<string | undefined>;
  end(error: Error | undefined): void;
}
export interface SocketFactoryResult {
  socket: SessionSocket;
  saveCreds(): Promise<void>;
  registered: boolean;
}
export type SocketFactory = (directory: string) => Promise<SocketFactoryResult>;
type Emit = (event: WhatsAppEvent) => Promise<void>;
type Active = {
  command: WhatsAppCommand;
  socket?: SessionSocket;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  attempt: number;
  stopped: boolean;
  pairingRequested: boolean;
};
export function createSessionManager({
  factory,
  emit,
  directory,
  schedule = (callback, ms) => setTimeout(callback, ms),
  onMessage,
}: {
  factory: SocketFactory;
  emit: Emit;
  directory: string;
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  onMessage?: (
    raw: any,
    historical: boolean,
    command: WhatsAppCommand,
  ) => Promise<WhatsAppEvent['messages']>;
}) {
  const sessions = new Map<string, Active>();
  const event = (active: Active, data: Omit<WhatsAppEvent, 'id' | 'sessionId' | 'generation'>) =>
    emit({
      id: randomUUID(),
      sessionId: active.command.sessionId,
      generation: active.command.generation,
      ...data,
    });
  const manifest = async (command: WhatsAppCommand, enabled: boolean) => {
    const folder = join(directory, command.sessionId);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    // Manifest has no credentials, QR, pairing codes, customer messages, or phone number.
    await writeFile(
      join(folder, 'session.json'),
      JSON.stringify({
        id: command.id,
        sessionId: command.sessionId,
        generation: command.generation,
        type: 'connect',
        provider: command.provider,
        importHistory: command.importHistory,
        enabled,
      }),
      { mode: 0o600 },
    );
  };
  function stop(active: Active) {
    active.stopped = true;
    clearTimeout(active.timer);
    clearInterval(active.heartbeat);
    for (const name of [
      'connection.update',
      'creds.update',
      'messages.upsert',
      'messaging-history.set',
      'messages.update',
    ])
      active.socket?.ev.removeAllListeners(name);
    active.socket?.end(undefined);
    sessions.delete(active.command.sessionId);
  }
  async function start(active: Active) {
    if (active.stopped) return;
    await event(active, { type: 'status', status: active.attempt ? 'reconnecting' : 'connecting' });
    const result = await factory(join(directory, active.command.sessionId));
    if (active.stopped) {
      result.socket.end(undefined);
      return;
    }
    active.socket = result.socket;
    const safe = (work: () => Promise<void>) => {
      void work()
        .catch(() => event(active, { type: 'status', status: 'error' }))
        .catch(() => undefined);
    };
    result.socket.ev.on('creds.update', () => safe(result.saveCreds));
    result.socket.ev.on('connection.update', (update) =>
      safe(async () => {
        if (active.stopped) return;
        if (update.qr) {
          if (active.command.phone && !result.registered && !active.pairingRequested) {
            active.pairingRequested = true;
            const code = await result.socket.requestPairingCode(
              active.command.phone.replace(/^\+/, ''),
            );
            await event(active, { type: 'status', status: 'pairing', pairingCode: code });
          } else if (!active.command.phone) {
            const { toDataURL } = await import('qrcode');
            await event(active, {
              type: 'status',
              status: 'qr',
              qr: await toDataURL(update.qr, { width: 256, margin: 2 }),
            });
          }
        }
        if (update.connection === 'open') {
          active.attempt = 0;
          active.command.phone = undefined;
          const phone = directIdentity(result.socket.user?.id ?? '')?.phone ?? undefined;
          await event(active, { type: 'status', status: 'connected', phone });
          clearInterval(active.heartbeat);
          active.heartbeat = setInterval(
            () => safe(() => event(active, { type: 'status', status: 'connected', phone })),
            30000,
          );
          active.heartbeat.unref?.();
        }
        if (update.connection === 'close') {
          clearInterval(active.heartbeat);
          const code = update.lastDisconnect?.error?.output?.statusCode;
          if (code === 401 || code === 440) {
            active.stopped = true;
            await manifest(active.command, false);
            sessions.delete(active.command.sessionId);
            await event(active, { type: 'status', status: 'logged_out' });
            return;
          }
          active.attempt++;
          active.pairingRequested = false;
          await event(active, { type: 'status', status: 'reconnecting' });
          clearTimeout(active.timer);
          active.timer = schedule(
            () => {
              void start(active).catch(() => recover(active));
            },
            Math.min(60000, 1000 * 2 ** Math.min(active.attempt, 6)),
          );
        }
      }),
    );
    const ingest = async (raws: any[], historical: boolean) => {
      // Never retain a full history store in memory. Persist in batches of at most 50.
      for (let offset = 0; offset < Math.min(raws.length, 1000); offset += 50) {
        const messages: NonNullable<WhatsAppEvent['messages']> = [];
        for (const raw of raws.slice(offset, offset + 50)) {
          const mapped = onMessage
            ? await onMessage(raw, historical, active.command)
            : parseText(raw, historical);
          messages.push(...(mapped ?? []));
        }
        if (messages.length) await event(active, { type: 'messages', messages });
      }
    };
    result.socket.ev.on('messages.upsert', ({ messages, type }) =>
      safe(() => ingest(messages, type !== 'notify')),
    );
    result.socket.ev.on('messaging-history.set', ({ messages = [], progress = 0 }) =>
      safe(async () => {
        await ingest(messages, true);
        await event(active, {
          type: 'history',
          historyProgress: Math.max(0, Math.min(100, progress)),
        });
      }),
    );
  }
  async function recover(active: Active) {
    if (active.stopped) return;
    active.attempt++;
    await event(active, { type: 'status', status: 'reconnecting' });
    active.timer = schedule(
      () => {
        void start(active).catch(() => recover(active));
      },
      Math.min(60000, 1000 * 2 ** Math.min(active.attempt, 6)),
    );
  }
  return {
    async command(command: WhatsAppCommand) {
      if (!/^[a-f0-9-]{36}$/i.test(command.sessionId)) throw new Error('Invalid session');
      const old = sessions.get(command.sessionId);
      if (old && command.generation < old.command.generation) return;
      if (command.type === 'connect') {
        if (old) stop(old);
        await manifest(command, command.provider === 'baileys');
        if (command.provider !== 'baileys') {
          await emit({
            id: randomUUID(),
            sessionId: command.sessionId,
            generation: command.generation,
            type: 'status',
            status: 'disconnected',
          });
          return;
        }
        if (sessions.size >= Number(process.env.WHATSAPP_MAX_SESSIONS || 1))
          throw new Error('Session limit');
        const active: Active = { command, attempt: 0, stopped: false, pairingRequested: false };
        sessions.set(command.sessionId, active);
        await start(active).catch(() => recover(active));
      } else if (command.type === 'disconnect') {
        if (old) stop(old);
        await manifest(command, false);
        await emit({
          id: randomUUID(),
          sessionId: command.sessionId,
          generation: command.generation,
          type: 'status',
          status: 'disconnected',
        });
      } else if (command.type === 'sync') {
        if (!old?.socket || !command.anchor || !command.jid)
          throw new Error('Session or history anchor unavailable');
        await old.socket.fetchMessageHistory(
          50,
          { id: command.anchor.id, fromMe: command.anchor.fromMe, remoteJid: command.jid },
          command.anchor.timestamp,
        );
      }
    },
    socket(id: string) {
      return sessions.get(id)?.socket;
    },
    async restore() {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const id of (await readdir(directory)).filter((id) => /^[a-f0-9-]{36}$/i.test(id))) {
        if (sessions.size >= Number(process.env.WHATSAPP_MAX_SESSIONS || 1)) break;
        try {
          const data = JSON.parse(await readFile(join(directory, id, 'session.json'), 'utf8'));
          if (data.enabled) await this.command(data);
        } catch {
          /* Broken manifests are not credentials. A manual reconnect can repair them. */
        }
      }
    },
    close() {
      for (const active of sessions.values()) stop(active);
    },
  };
}
export function parseText(raw: any, historical: boolean): WhatsAppEvent['messages'] {
  const identity = directIdentity(raw?.key?.remoteJid ?? '', raw?.key?.remoteJidAlt);
  if (!identity || !raw?.key?.id) return [];
  const content =
    raw.message?.ephemeralMessage?.message ?? raw.message?.viewOnceMessage?.message ?? raw.message;
  const text = content?.conversation ?? content?.extendedTextMessage?.text;
  if (typeof text !== 'string' || !text.trim()) return [];
  const timestamp = Number(raw.messageTimestamp?.toString?.() ?? raw.messageTimestamp) * 1000;
  return [
    {
      externalId: raw.key.id,
      jid: identity.jid,
      phone: identity.phone,
      name: String(raw.pushName || 'Contato WhatsApp').slice(0, 180),
      text: text.slice(0, 10000),
      fromMe: raw.key.fromMe === true,
      historical,
      timestamp: new Date(
        Number.isFinite(timestamp) && timestamp > 0 && timestamp < Date.now() + 86400000
          ? timestamp
          : Date.now(),
      ).toISOString(),
      type: 'text',
    },
  ];
}

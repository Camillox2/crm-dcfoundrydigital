import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
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
  logout?(): Promise<void>;
  end(error: Error | undefined): void;
}
export interface SocketFactoryResult {
  socket: SessionSocket;
  saveCreds(): Promise<void>;
  registered: boolean;
}
export type SocketFactory = (directory: string) => Promise<SocketFactoryResult>;
type Emit = (event: WhatsAppEvent) => Promise<void>;
export function whatsAppSessionDirectory(directory: string, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid session UUID');
  const root = resolve(directory),
    target = resolve(root, id);
  if (relative(root, target) !== id) throw new Error('Invalid session directory');
  return target;
}
export async function resetWhatsAppSession(directory: string, id: string) {
  await rm(whatsAppSessionDirectory(directory, id), { recursive: true, force: true });
}
type Active = {
  command: WhatsAppCommand;
  socket?: SessionSocket;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  attempt: number;
  stopped: boolean;
  pairingRequested: boolean;
  credentials: Promise<void>;
};
export function createSessionManager({
  factory,
  emit,
  directory,
  schedule = (callback, ms) => setTimeout(callback, ms),
  onMessage,
  onCommand,
  assertOwner = () => {},
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
  onCommand?: (command: WhatsAppCommand, socket: SessionSocket | undefined) => Promise<void>;
  assertOwner?: () => void;
}) {
  const sessions = new Map<string, Active>();
  const generations = new Map<string, { generation: number; id: string }>();
  let tail = Promise.resolve(),
    closing = false;
  // Commands, reconnect timers and connection transitions cannot open competing sockets.
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const event = (active: Active, data: Omit<WhatsAppEvent, 'id' | 'sessionId' | 'generation'>) =>
    emit({
      id: randomUUID(),
      sessionId: active.command.sessionId,
      generation: active.command.generation,
      ...data,
    });
  const folder = (id: string) => whatsAppSessionDirectory(directory, id);
  const manifest = async (command: WhatsAppCommand, enabled: boolean) => {
    const target = folder(command.sessionId);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const temporary = join(target, 'session.json.tmp');
    await writeFile(
      temporary,
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
    await rename(temporary, join(target, 'session.json'));
  };
  function detach(active: Active) {
    clearInterval(active.heartbeat);
    const socket = active.socket;
    active.socket = undefined;
    for (const name of [
      'connection.update',
      'creds.update',
      'messages.upsert',
      'messaging-history.set',
      'messages.update',
    ])
      socket?.ev.removeAllListeners(name);
    socket?.end(undefined);
    return socket;
  }
  async function stop(active: Active) {
    active.stopped = true;
    clearTimeout(active.timer);
    detach(active);
    if (sessions.get(active.command.sessionId) === active)
      sessions.delete(active.command.sessionId);
    // Flush pairing credentials before the next socket reads the auth folder.
    await active.credentials;
  }
  const current = (active: Active, socket: SessionSocket) =>
    !closing &&
    !active.stopped &&
    sessions.get(active.command.sessionId) === active &&
    active.socket === socket;
  function reconnect(active: Active) {
    if (active.stopped || closing) return;
    clearTimeout(active.timer);
    active.attempt++;
    active.pairingRequested = false;
    active.timer = schedule(
      () => {
        void serial(async () => {
          if (active.stopped || closing) return;
          await start(active).catch(() => recover(active));
        });
      },
      Math.min(60000, 1000 * 2 ** Math.min(active.attempt, 6)),
    );
    active.timer.unref?.();
  }
  async function recover(active: Active) {
    if (active.stopped || closing) return;
    detach(active);
    await event(active, { type: 'status', status: 'reconnecting' }).catch(() => undefined);
    reconnect(active);
  }
  async function start(active: Active) {
    if (active.stopped || closing) return;
    assertOwner();
    detach(active);
    await active.credentials;
    await event(active, { type: 'status', status: active.attempt ? 'reconnecting' : 'connecting' });
    const result = await factory(folder(active.command.sessionId)),
      socket = result.socket;
    if (active.stopped || closing) {
      socket.end(undefined);
      return;
    }
    assertOwner();
    active.socket = socket;
    const safe = (work: () => Promise<void>) => {
      if (!current(active, socket)) return;
      void (async () => {
        assertOwner();
        await work();
      })()
        .catch(() =>
          current(active, socket) ? event(active, { type: 'status', status: 'error' }) : undefined,
        )
        .catch(() => undefined);
    };
    socket.ev.on('creds.update', () => {
      if (!current(active, socket)) return;
      active.credentials = active.credentials
        .then(async () => {
          assertOwner();
          await result.saveCreds();
        })
        .catch(() => {
          if (current(active, socket))
            void event(active, { type: 'status', status: 'error' }).catch(() => undefined);
        });
    });
    socket.ev.on('messages.update', (updates: any[]) =>
      safe(async () => {
        for (const update of updates) {
          if (!current(active, socket)) return;
          const identity = directIdentity(update.key?.remoteJid ?? ''),
            status = Number(update.update?.status);
          if (identity && update.key?.id && status >= 2)
            await event(active, {
              type: 'receipt',
              jid: identity.jid,
              externalId: update.key.id,
              delivery: status >= 4 ? 'read' : status >= 3 ? 'delivered' : 'sent',
            });
        }
      }),
    );
    socket.ev.on('connection.update', (update) => {
      void serial(async () => {
        if (!current(active, socket)) return;
        assertOwner();
        if (update.connection === 'close') {
          detach(active);
          await active.credentials;
          const code = Number(update.lastDisconnect?.error?.output?.statusCode);
          if (code === 440) {
            await stop(active);
            await manifest(active.command, false);
            await event(active, { type: 'status', status: 'disconnected' });
            return; // Another device/process replaced us: never fight it in a reconnect loop.
          }
          if (code === 401 || code === 500) {
            // Confirmed logout/bad auth only. A 515 restart preserves newly paired credentials.
            await event(active, { type: 'status', status: 'logged_out' });
            await resetWhatsAppSession(directory, active.command.sessionId);
            active.command.phone = undefined;
            await manifest(active.command, true);
          }
          await event(active, { type: 'status', status: 'reconnecting' });
          reconnect(active);
          return;
        }
        if (update.qr) {
          if (active.command.phone && !result.registered && !active.pairingRequested) {
            active.pairingRequested = true;
            const code = await socket.requestPairingCode(active.command.phone.replace(/^\+/, ''));
            if (current(active, socket))
              await event(active, { type: 'status', status: 'pairing', pairingCode: code });
          } else if (!active.command.phone) {
            const { toDataURL } = await import('qrcode');
            const qr = await toDataURL(update.qr, { width: 256, margin: 2 });
            if (current(active, socket)) await event(active, { type: 'status', status: 'qr', qr });
          }
        }
        if (update.connection === 'open') {
          active.attempt = 0;
          active.command.phone = undefined;
          const phone = directIdentity(socket.user?.id ?? '')?.phone ?? undefined;
          await event(active, { type: 'status', status: 'connected', phone });
          clearInterval(active.heartbeat);
          active.heartbeat = setInterval(
            () => safe(() => event(active, { type: 'status', status: 'connected', phone })),
            30000,
          );
          active.heartbeat.unref?.();
        }
      })
        .catch(() => (current(active, socket) ? recover(active) : undefined))
        .catch(() => undefined);
    });
    let messagesTail = Promise.resolve();
    const ingest = async (raws: any[], historical: boolean) => {
      for (let offset = 0; offset < Math.min(raws.length, 1000); offset += 50) {
        if (!current(active, socket)) return;
        assertOwner();
        const messages: NonNullable<WhatsAppEvent['messages']> = [];
        for (const raw of raws.slice(offset, offset + 50)) {
          const mapped = onMessage
            ? await onMessage(raw, historical, active.command)
            : parseText(raw, historical);
          messages.push(...(mapped ?? []));
        }
        if (current(active, socket) && messages.length)
          await event(active, { type: 'messages', messages });
      }
    };
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      messagesTail = messagesTail
        .then(() => ingest(messages, type !== 'notify'))
        .catch(() => undefined);
    });
    socket.ev.on('messaging-history.set', ({ messages = [], progress = 0 }) => {
      messagesTail = messagesTail
        .then(async () => {
          await ingest(messages, true);
          if (current(active, socket))
            await event(active, {
              type: 'history',
              historyProgress: Math.max(0, Math.min(100, progress)),
            });
        })
        .catch(() => undefined);
    });
  }
  const manager = {
    async command(command: WhatsAppCommand) {
      folder(command.sessionId);
      return serial(async () => {
        if (closing) throw new Error('WhatsApp worker is stopping');
        assertOwner();
        const old = sessions.get(command.sessionId),
          known = generations.get(command.sessionId);
        if (known && command.generation < known.generation) return;
        if (command.type === 'connect' || command.type === 'disconnect') {
          if (known?.generation === command.generation && known.id === command.id) return;
          if (old) await stop(old);
          if (command.type === 'disconnect') {
            await manifest(command, false);
            generations.set(command.sessionId, { generation: command.generation, id: command.id });
            await emit({
              id: randomUUID(),
              sessionId: command.sessionId,
              generation: command.generation,
              type: 'status',
              status: 'disconnected',
            });
            return;
          }
          if (command.provider !== 'baileys') {
            await manifest(command, false);
            generations.set(command.sessionId, { generation: command.generation, id: command.id });
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
          await manifest(command, true);
          generations.set(command.sessionId, { generation: command.generation, id: command.id });
          const active: Active = {
            command: { ...command },
            attempt: 0,
            stopped: false,
            pairingRequested: false,
            credentials: Promise.resolve(),
          };
          sessions.set(command.sessionId, active);
          await start(active).catch(() => recover(active));
        } else {
          if (!old?.socket || old.command.generation !== command.generation)
            throw new Error('Session generation unavailable');
          if (command.type === 'sync') {
            if (!command.anchor || !command.jid) throw new Error('History anchor unavailable');
            await old.socket.fetchMessageHistory(
              50,
              { id: command.anchor.id, fromMe: command.anchor.fromMe, remoteJid: command.jid },
              command.anchor.timestamp,
            );
          } else {
            if (!onCommand) throw new Error('Command handler unavailable');
            await onCommand(command, old.socket);
          }
        }
      });
    },
    socket(id: string) {
      return sessions.get(id)?.socket;
    },
    async restore() {
      closing = false;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const id of (await readdir(directory)).filter((id) => /^[a-f0-9-]{36}$/i.test(id))) {
        if (sessions.size >= Number(process.env.WHATSAPP_MAX_SESSIONS || 1)) break;
        try {
          const data = JSON.parse(await readFile(join(directory, id, 'session.json'), 'utf8'));
          if (data.enabled) {
            generations.delete(id);
            await manager.command(data);
          } else generations.set(id, { generation: data.generation, id: data.id });
        } catch {
          /* A manual reconnect repairs a broken manifest. */
        }
      }
    },
    async close() {
      closing = true;
      // Close sockets synchronously on lease loss, even if a command is awaiting I/O.
      await Promise.all([...sessions.values()].map((active) => stop(active)));
    },
  };
  return manager;
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

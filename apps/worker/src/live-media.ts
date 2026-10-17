import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { directIdentity, type WhatsAppCommand, type WhatsAppEvent } from '@dcfoundry/shared';
import { parseText, type SessionSocket } from './whatsapp-session.js';
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
export function safeMediaKey(key: string) {
  if (!/^wa-[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid media key');
  return key;
}
export async function writeLimitedMedia(source: AsyncIterable<Uint8Array>, directory: string) {
  const pieces: Buffer[] = [];
  let length = 0;
  for await (const piece of source) {
    length += piece.byteLength;
    if (length > MAX_MEDIA_BYTES) throw new Error('Media exceeds 16 MB');
    pieces.push(Buffer.from(piece));
  }
  const key = 'wa-' + randomUUID();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, key), Buffer.concat(pieces), { mode: 0o600, flag: 'wx' });
  return { key, bytes: length };
}
export async function mapMediaMessage(
  raw: any,
  historical: boolean,
  command: WhatsAppCommand,
  download: (content: any, type: string) => Promise<AsyncIterable<Uint8Array>>,
  directory: string,
): Promise<WhatsAppEvent['messages']> {
  const text = parseText(raw, historical);
  if (text?.length) return text;
  const identity = directIdentity(raw?.key?.remoteJid ?? '', raw?.key?.remoteJidAlt);
  if (!identity || !raw?.key?.id) return [];
  let content = raw.message;
  for (let i = 0; i < 5; i++) {
    const nested =
      content?.ephemeralMessage?.message ??
      content?.viewOnceMessage?.message ??
      content?.viewOnceMessageV2?.message ??
      content?.documentWithCaptionMessage?.message ??
      content?.deviceSentMessage?.message;
    if (!nested) break;
    content = nested;
  }
  const options = [
    ['imageMessage', 'image', 'image/jpeg'],
    ['audioMessage', 'audio', 'audio/ogg'],
    ['documentMessage', 'file', 'application/octet-stream'],
    ['videoMessage', 'video', 'video/mp4'],
    ['stickerMessage', 'sticker', 'image/webp'],
  ] as const;
  const candidate = options.find(([field]) => content?.[field]);
  if (!candidate) return [];
  const [field, type, fallback] = candidate,
    media = content[field],
    mime = String(media.mimetype || fallback)
      .split(';')[0]!
      .slice(0, 150);
  // History downloads are lazy: importing old messages cannot exhaust the worker's RAM.
  let saved: { key: string; bytes: number } | undefined;
  if (
    !historical &&
    Number(media.fileLength?.toString?.() ?? media.fileLength ?? 0) <= MAX_MEDIA_BYTES
  ) {
    try {
      saved = await writeLimitedMedia(
        await download(media, type === 'file' ? 'document' : type),
        directory,
      );
    } catch {
      /* The message remains visible even if media expired or exceeded the limit. */
    }
  }
  const time = Number(raw.messageTimestamp?.toString?.() ?? raw.messageTimestamp) * 1000;
  return [
    {
      externalId: raw.key.id,
      jid: identity.jid,
      phone: identity.phone,
      name: String(raw.pushName || 'Contato WhatsApp').slice(0, 180),
      text: String(media.caption || '').slice(0, 10000),
      fromMe: raw.key.fromMe === true,
      historical,
      timestamp: new Date(
        Number.isFinite(time) && time > 0 && time < Date.now() + 86400000 ? time : Date.now(),
      ).toISOString(),
      type,
      mediaKey: saved?.key,
      mediaBytes: saved?.bytes,
      mime,
      fileName: String(media.fileName || `${type}-${raw.key.id}`).slice(0, 180),
    },
  ];
}
export function createLivePhotos(clock = Date.now) {
  const cache = new Map<string, { until: number; url: string | null }>();
  return async (
    socket: SessionSocket | undefined,
    session: string,
    generation: number,
    jid: string,
  ) => {
    if (!socket) return null;
    const key = `${session}/${generation}/${jid}`,
      previous = cache.get(key);
    if (previous && previous.until > clock()) return previous.url;
    let url: string | null = null;
    try {
      const value = await socket.profilePictureUrl(jid, 'image');
      if (value) {
        const candidate = new URL(value);
        if (
          candidate.protocol === 'https:' &&
          !candidate.username &&
          !candidate.password &&
          candidate.hostname.endsWith('.whatsapp.net')
        )
          url = candidate.href;
      }
    } catch {
      /* Missing/private profile pictures use initials. */
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { url, until: clock() + (url ? 30 : 5) * 60000 });
    return url;
  };
}
export async function executeLiveCommand(
  command: WhatsAppCommand,
  socket: SessionSocket | undefined,
  emit: (event: WhatsAppEvent) => Promise<void>,
  directory: string,
  photos: ReturnType<typeof createLivePhotos>,
) {
  if (!socket || !command.jid) throw new Error('WhatsApp disconnected');
  const base = { id: randomUUID(), sessionId: command.sessionId, generation: command.generation };
  if (command.type === 'photo') {
    await emit({
      ...base,
      type: 'photo',
      jid: command.jid,
      photoUrl: await photos(socket, command.sessionId, command.generation, command.jid),
    });
    return;
  }
  if (command.type !== 'send' || !command.messageId) throw new Error('Unsupported command');
  const media = command.media,
    content: Record<string, unknown> = media
      ? {
          [media.type === 'file' ? 'document' : media.type]: {
            url: join(directory, safeMediaKey(media.key)),
          },
          mimetype: media.mime,
          ...(media.type === 'file' ? { fileName: media.name } : {}),
          ...(media.type !== 'audio' && media.type !== 'sticker' ? { caption: command.text ?? '' } : {}),
        }
      : { text: command.text ?? '' };
  const messageId = command.messageId.replaceAll('-', '').toUpperCase();
  const sent = await socket.sendMessage(command.jid, content, { messageId });
  if (!sent?.key?.id) throw new Error('Provider did not acknowledge the message');
  await emit({
    ...base,
    type: 'receipt',
    externalId: messageId,
    jid: command.jid,
    delivery: 'sent',
  });
}

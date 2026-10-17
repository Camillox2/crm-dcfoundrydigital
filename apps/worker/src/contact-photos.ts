/** Adapter for an already paired Baileys socket. It never bypasses photo privacy. */
export interface ContactPhotoSocket {
  profilePictureUrl(jid: string, type: 'image'): Promise<string | undefined>;
}
export interface ContactPhotoUpdate {
  leadId: string;
  photoUrl: string | null;
  checkedAt: Date;
}
export function createContactPhotoSync(
  socket: ContactPhotoSocket,
  save: (update: ContactPhotoUpdate) => Promise<void>,
  clock: () => number = Date.now,
) {
  const cache = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  return function sync(leadId: string, phoneE164: string): Promise<void> {
    if (!/^\+?\d{10,15}$/.test(phoneE164))
      return Promise.reject(new Error('Use a normalized phone number.'));
    const key = `${leadId}:${phoneE164}`;
    if ((cache.get(key) ?? 0) > clock()) return Promise.resolve();
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      try {
        const raw = await socket.profilePictureUrl(
          `${phoneE164.replace(/^\+/, '')}@s.whatsapp.net`,
          'image',
        );
        const photoUrl =
          raw && raw.length < 8192 && new URL(raw).protocol === 'https:' ? raw : null;
        await save({ leadId, photoUrl, checkedAt: new Date(clock()) });
        if (cache.size >= 1000) cache.clear();
        cache.set(key, clock() + (photoUrl ? 6 * 60 * 60_000 : 15 * 60_000));
      } catch {
        /* A transient/provider failure keeps the existing photo and retries later. */
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, task);
    return task;
  };
}

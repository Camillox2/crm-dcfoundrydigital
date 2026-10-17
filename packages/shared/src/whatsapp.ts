import { z } from 'zod';
export const WhatsAppStatus = z.enum([
  'disconnected',
  'connecting',
  'qr',
  'pairing',
  'connected',
  'reconnecting',
  'logged_out',
  'error',
]);
export const SessionInput = z.object({
  provider: z.enum(['baileys', 'meta']).default('baileys'),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  importHistory: z.boolean().default(false),
});
export type WhatsAppCommand = {
  id: string;
  sessionId: string;
  generation: number;
  type: 'connect' | 'disconnect' | 'sync' | 'send' | 'photo';
  provider: 'baileys' | 'meta';
  phone?: string;
  importHistory?: boolean;
  messageId?: string;
  jid?: string;
  text?: string;
  anchor?: { id: string; fromMe: boolean; timestamp: number };
  media?: { key: string; mime: string; name: string; type: 'image' | 'audio' | 'file' };
};
export const WhatsAppMessageInput = z.object({
  externalId: z.string().min(1).max(200),
  jid: z.string().max(160),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  name: z.string().max(180).default('Contato WhatsApp'),
  text: z.string().max(10000),
  fromMe: z.boolean(),
  historical: z.boolean(),
  timestamp: z.string().datetime(),
  type: z.enum(['text', 'image', 'audio', 'file', 'video', 'sticker']).default('text'),
  mediaKey: z.string().max(200).optional(),
  mime: z.string().max(150).optional(),
  fileName: z.string().max(180).optional(),
  mediaBytes: z.number().int().min(0).max(16777216).optional(),
  messageId: z.string().uuid().optional(),
  actorType: z.enum(['human', 'foundry', 'contact']).optional(),
});
export const WhatsAppEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  generation: z.number().int().positive(),
  type: z.enum(['status', 'messages', 'history', 'photo', 'receipt']),
  status: WhatsAppStatus.optional(),
  qr: z.string().max(300000).optional(),
  pairingCode: z.string().max(40).optional(),
  phone: z.string().max(24).optional(),
  historyProgress: z.number().min(0).max(100).optional(),
  messages: z.array(WhatsAppMessageInput).max(50).optional(),
  jid: z.string().max(160).optional(),
  photoUrl: z.string().url().max(8192).nullable().optional(),
  externalId: z.string().max(200).optional(),
  delivery: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
});
export type WhatsAppEvent = z.infer<typeof WhatsAppEventSchema>;
export function directIdentity(jid: string, alternate?: string | null) {
  const clean = (value: string) => value.replace(/:\d+(?=@)/, '');
  const normalized = clean(jid);
  if (!/^\d+@(s\.whatsapp\.net|lid)$/.test(normalized)) return null;
  const phoneJid = [alternate ? clean(alternate) : '', normalized].find((value) =>
    /^\d{8,15}@s\.whatsapp\.net$/.test(value),
  );
  return { jid: normalized, phone: phoneJid ? '+' + phoneJid.split('@')[0] : null };
}
export function canonicalWhatsAppStatus(provider: string, status: string) {
  if (provider !== 'baileys') return 'disconnected' as const;
  return WhatsAppStatus.safeParse(status).success
    ? (status as z.infer<typeof WhatsAppStatus>)
    : ('disconnected' as const);
}

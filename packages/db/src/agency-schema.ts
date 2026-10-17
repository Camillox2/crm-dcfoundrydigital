import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './schema.js';
export const workspaceLeads = pgTable('workspace_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 180 }).notNull(),
  company: varchar('company', { length: 180 }).notNull(),
  phone: varchar('phone', { length: 24 }).notNull(),
});
export const waSessions = pgTable('wa_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  provider: varchar('provider', { length: 16 }).notNull().default('baileys'),
  status: varchar('status', { length: 24 }).notNull().default('disconnected'),
  generation: integer('generation').notNull().default(1),
  phone: varchar('phone', { length: 24 }),
  qr: text('qr'),
  pairingCode: varchar('pairing_code', { length: 40 }),
  credentialsExpiresAt: timestamp('credentials_expires_at', { withTimezone: true }),
  importHistory: boolean('import_history').notNull().default(false),
  historyProgress: integer('history_progress').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const whatsappIdentities = pgTable(
  'wa_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => waSessions.id),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => workspaceLeads.id),
    jid: varchar('jid', { length: 160 }).notNull(),
    phoneE164: varchar('phone_e164', { length: 24 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wa_identities_session_jid_uq').on(t.sessionId, t.jid)],
);
export const whatsappMessages = pgTable(
  'wa_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => waSessions.id),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => workspaceLeads.id),
    externalId: varchar('external_id', { length: 200 }).notNull(),
    jid: varchar('jid', { length: 160 }).notNull(),
    direction: varchar('direction', { length: 16 }).notNull(),
    actorType: varchar('actor_type', { length: 16 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    body: text('body').notNull().default(''),
    historical: boolean('historical').notNull().default(false),
    messageType: varchar('message_type', { length: 16 }).notNull().default('text'),
    delivery: varchar('delivery', { length: 16 }).notNull().default('received'),
    mediaKey: varchar('media_key', { length: 200 }),
    mimeType: varchar('mime_type', { length: 150 }),
    fileName: varchar('file_name', { length: 180 }),
    mediaBytes: integer('media_bytes'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wa_messages_lead_date_idx').on(t.leadId, t.sentAt)],
);
export const whatsappCommands = pgTable('wa_commands', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => waSessions.id),
  generation: integer('generation').notNull(),
  commandType: varchar('command_type', { length: 24 }).notNull(),
  phone: varchar('phone', { length: 24 }),
  messageId: uuid('message_id').references(() => whatsappMessages.id),
  jid: varchar('jid', { length: 160 }),
  body: text('body'),
  mediaKey: varchar('media_key', { length: 200 }),
  mimeType: varchar('mime_type', { length: 150 }),
  fileName: varchar('file_name', { length: 180 }),
  mediaType: varchar('media_type', { length: 16 }),
  anchorId: varchar('anchor_id', { length: 200 }),
  anchorFromMe: boolean('anchor_from_me'),
  anchorTimestamp: bigint('anchor_timestamp', { mode: 'number' }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const whatsappEventReceipts = pgTable('wa_event_receipts', {
  id: uuid('id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
export const whatsappMediaUploads = pgTable('wa_media_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => workspaceLeads.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  storageKey: varchar('storage_key', { length: 200 }).notNull().unique(),
  mimeType: varchar('mime_type', { length: 150 }).notNull(),
  fileName: varchar('file_name', { length: 180 }).notNull(),
  mediaType: varchar('media_type', { length: 16 }).notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

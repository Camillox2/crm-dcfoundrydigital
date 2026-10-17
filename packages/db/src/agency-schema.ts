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
import { users, pipelines } from './schema.js';
export const workspaceLeads = pgTable('workspace_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 180 }).notNull(),
  company: varchar('company', { length: 180 }).notNull(),
  phone: varchar('phone', { length: 24 }).notNull(),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => pipelines.id),
  projectType: varchar('project_type', { length: 32 }),
  objective: text('objective'),
  budgetCents: bigint('budget_cents', { mode: 'number' }),
  deadlineText: varchar('deadline_text', { length: 300 }),
  decisionMaker: varchar('decision_maker', { length: 180 }),
  urgency: varchar('urgency', { length: 24 }),
  aiPaused: boolean('ai_paused').notNull().default(false),
  aiControlRevision: integer('ai_control_revision').notNull().default(1),
  handoffReason: varchar('handoff_reason', { length: 180 }),
  aiSummary: text('ai_summary'),
  aiSummaryAt: timestamp('ai_summary_at', { withTimezone: true }),
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
  leadId: uuid('lead_id').references(() => workspaceLeads.id),
  aiRevision: integer('ai_revision'),
  handoffAck: boolean('handoff_ack').notNull().default(false),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
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
const foundryRecord = () => ({
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 180 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const foundryKnowledge = pgTable('foundry_knowledge', {
  ...foundryRecord(),
  content: text('content').notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  audience: varchar('audience', { length: 16 }).notNull().default('public'),
});
export const foundryGuidance = pgTable('foundry_guidance', {
  ...foundryRecord(),
  instructions: text('instructions').notNull(),
  tone: varchar('tone', { length: 16 }).notNull(),
});
export const foundryKnowledgeVersions = pgTable('foundry_knowledge_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => foundryKnowledge.id),
  version: integer('version').notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  content: text('content').notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  audience: varchar('audience', { length: 16 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const foundryGuidanceVersions = pgTable('foundry_guidance_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => foundryGuidance.id),
  version: integer('version').notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  instructions: text('instructions').notNull(),
  tone: varchar('tone', { length: 16 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const foundrySettings = pgTable('foundry_settings', {
  singleton: boolean('singleton').primaryKey().default(true),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const foundryTurns = pgTable('foundry_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id')
    .notNull()
    .unique()
    .references(() => whatsappMessages.id),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => workspaceLeads.id),
  controlRevision: integer('control_revision').notNull(),
  state: varchar('state', { length: 24 }).notNull().default('processing'),
  answer: text('answer'),
  model: varchar('model', { length: 120 }),
  handoff: boolean('handoff').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
export const foundryLabRuns = pgTable('foundry_lab_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  scenarioSlug: varchar('scenario_slug', { length: 80 }).notNull(),
  answer: text('answer').notNull(),
  model: varchar('model', { length: 120 }).notNull(),
  handoff: boolean('handoff').notNull(),
  passed: boolean('passed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const leadTags = pgTable('lead_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 40 }).notNull().unique(),
  color: varchar('color', { length: 7 }).notNull().default('#246ba5'),
});
export const leadTagLinks = pgTable('lead_tag_links', {
  leadId: uuid('lead_id')
    .notNull()
    .references(() => workspaceLeads.id),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => leadTags.id),
});
export const leadAttachments = pgTable('lead_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => workspaceLeads.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  fileName: varchar('file_name', { length: 180 }).notNull(),
  mimeType: varchar('mime_type', { length: 150 }).notNull(),
  storageKey: varchar('storage_key', { length: 200 }).notNull().unique(),
  bytes: integer('bytes').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const pipelineStageRevisions = pgTable('pipeline_stage_revisions', {
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => pipelines.id),
  version: integer('version').notNull(),
  slug: varchar('slug', { length: 32 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  position: integer('position').notNull(),
  slaMinutes: integer('sla_minutes').notNull(),
  colorHex: varchar('color_hex', { length: 16 }).notNull(),
  isWon: boolean('is_won').notNull(),
  isLost: boolean('is_lost').notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});

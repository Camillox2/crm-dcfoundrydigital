import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users, pipelines } from './schema.js';
export const websiteChatSessions = pgTable('website_chat_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  visitorHash: varchar('visitor_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  path: varchar('path', { length: 500 }).notNull().default('/'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
});
export const websiteChatMessages = pgTable('website_chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => websiteChatSessions.id),
  leadId: uuid('lead_id').notNull(),
  role: varchar('role', { length: 16 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  body: text('body').notNull(),
  requestKey: uuid('request_key'),
  replyToId: uuid('reply_to_id').unique(),
  turnState: varchar('turn_state', { length: 24 }).notNull().default('completed'),
  model: varchar('model', { length: 180 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const crmNotifications = pgTable('crm_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  eventKey: varchar('event_key', { length: 240 }).notNull().unique(),
  kind: varchar('kind', { length: 32 }).notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  body: varchar('body', { length: 500 }).notNull(),
  page: varchar('page', { length: 32 }).notNull(),
  entityId: uuid('entity_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  endpoint: text('endpoint').notNull(),
  endpointHash: varchar('endpoint_hash', { length: 64 }).notNull().unique(),
  p256dh: varchar('p256dh', { length: 180 }).notNull(),
  authCiphertext: text('auth_ciphertext').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const notificationPushDeliveries = pgTable('notification_push_deliveries', {
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => crmNotifications.id),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => pushSubscriptions.id),
  status: varchar('status', { length: 24 }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  lastStatus: integer('last_status'),
});
export const calendarSettings = pgTable('calendar_settings', {
  ownerId: uuid('owner_id')
    .primaryKey()
    .references(() => users.id),
  enabled: boolean('enabled').notNull().default(false),
  weekdays: integer('weekdays').array().notNull(),
  startHour: integer('start_hour').notNull().default(9),
  endHour: integer('end_hour').notNull().default(18),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  version: integer('version').notNull().default(1),
});
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  kind: varchar('kind', { length: 24 }).notNull(),
  description: text('description').notNull().default(''),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  meetingUrl: text('meeting_url').notNull().default(''),
  status: varchar('status', { length: 16 }).notNull().default('scheduled'),
  source: varchar('source', { length: 16 }).notNull().default('user'),
  sourceKey: varchar('source_key', { length: 180 }).unique(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const calendarEventVersions = pgTable('calendar_event_versions', {
  eventId: uuid('event_id')
    .notNull()
    .references(() => calendarEvents.id),
  version: integer('version').notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  kind: varchar('kind', { length: 24 }).notNull(),
  description: text('description').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  meetingUrl: text('meeting_url').notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  leadId: uuid('lead_id'),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const clientPortalLinks = pgTable('client_portal_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const serviceRequests = pgTable('service_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 180 }).notNull(),
  kind: varchar('kind', { length: 24 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  priority: varchar('priority', { length: 16 }).notNull().default('normal'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const serviceRequestEvents = pgTable('service_request_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => serviceRequests.id),
  actorType: varchar('actor_type', { length: 16 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  message: text('message').notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const proposalAcceptances = pgTable('proposal_acceptances', {
  id: uuid('id').defaultRandom().primaryKey(),
  proposalId: uuid('proposal_id').notNull(),
  proposalVersion: integer('proposal_version').notNull(),
  portalId: uuid('portal_id')
    .notNull()
    .references(() => clientPortalLinks.id),
  name: varchar('name', { length: 180 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }).notNull(),
  userAgent: varchar('user_agent', { length: 500 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
});
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
  websiteEnabled: boolean('website_enabled').notNull().default(false),
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
export const companySettings = pgTable('company_settings', {
  singleton: boolean('singleton').primaryKey().default(true),
  name: varchar('name', { length: 180 }).notNull(),
  documentCiphertext: text('document_ciphertext').notNull(),
  address: text('address').notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  phone: varchar('phone', { length: 24 }).notNull(),
  representative: varchar('representative', { length: 180 }).notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const proposalFields = () => ({
  title: varchar('title', { length: 180 }).notNull(),
  client: varchar('client', { length: 180 }).notNull(),
  leadId: uuid('lead_id').references(() => workspaceLeads.id),
  clientDocumentCiphertext: text('client_document_ciphertext').notNull().default(''),
  clientEmail: varchar('client_email', { length: 254 }).notNull().default(''),
  clientAddress: text('client_address').notNull().default(''),
  clientRepresentative: varchar('client_representative', { length: 180 }).notNull().default(''),
  serviceType: varchar('service_type', { length: 32 }).notNull().default('site_landing'),
  valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
  upfrontCents: bigint('upfront_cents', { mode: 'number' }).notNull().default(0),
  installments: integer('installments').notNull().default(1),
  paymentDay: integer('payment_day').notNull().default(10),
  billing: varchar('billing', { length: 16 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('draft'),
  scope: text('scope').notNull(),
  terms: text('terms').notNull(),
  validUntil: date('valid_until'),
});
export const agencyProposals = pgTable('agency_proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  ...proposalFields(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyProposalVersions = pgTable('agency_proposals_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyProposals.id),
  version: integer('version').notNull(),
  ...proposalFields(),
  actorId: uuid('actor_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 16 }).notNull().default('user'),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyServiceContracts = pgTable('service_contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => workspaceLeads.id),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => agencyProposals.id),
  proposalVersion: integer('proposal_version').notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  serviceType: varchar('service_type', { length: 32 }).notNull(),
  documentCiphertext: text('document_ciphertext').notNull(),
  documentHash: varchar('document_hash', { length: 64 }).notNull(),
  clientDocumentCiphertext: text('client_document_ciphertext').notNull(),
  clientEmail: varchar('client_email', { length: 254 }).notNull(),
  clientName: varchar('client_name', { length: 180 }).notNull(),
  companyName: varchar('company_name', { length: 180 }).notNull(),
  companyDocumentCiphertext: text('company_document_ciphertext').notNull(),
  providerRepresentative: varchar('provider_representative', { length: 180 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  tokenCiphertext: text('token_ciphertext').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('issued'),
  valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
  billing: varchar('billing', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const serviceContractSignatures = pgTable('contract_signatures', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => agencyServiceContracts.id),
  party: varchar('party', { length: 16 }).notNull(),
  signerName: varchar('signer_name', { length: 180 }).notNull(),
  signerDocumentHash: varchar('signer_document_hash', { length: 64 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }).notNull(),
  userAgent: varchar('user_agent', { length: 500 }).notNull(),
  documentHash: varchar('document_hash', { length: 64 }).notNull(),
  evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
});
export const serviceContractDeliveries = pgTable('contract_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => agencyServiceContracts.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  channel: varchar('channel', { length: 16 }).notNull(),
  recipient: varchar('recipient', { length: 254 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('queued'),
  requestId: uuid('request_id').notNull().unique(),
  waMessageId: uuid('wa_message_id').references(() => whatsappMessages.id),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

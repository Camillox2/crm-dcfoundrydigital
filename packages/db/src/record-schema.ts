import {
  boolean,
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  numeric,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './schema.js';
export const agencyBlogPosts = pgTable('agency_blog_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  slug: varchar('slug', { length: 180 }).notNull(),
  excerpt: numeric('excerpt', { precision: 20, scale: 4 }).notNull(),
  content: numeric('content', { precision: 20, scale: 4 }).notNull(),
  coverUrl: numeric('cover_url', { precision: 20, scale: 4 }).notNull(),
  coverAlt: varchar('cover_alt', { length: 200 }).notNull(),
  author: varchar('author', { length: 180 }).notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  tags: text('tags').array().notNull(),
  seoTitle: varchar('seo_title', { length: 70 }).notNull(),
  seoDescription: varchar('seo_description', { length: 180 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyBlogPostsVersions = pgTable('agency_blog_posts_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyBlogPosts.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  slug: varchar('slug', { length: 180 }).notNull(),
  excerpt: numeric('excerpt', { precision: 20, scale: 4 }).notNull(),
  content: numeric('content', { precision: 20, scale: 4 }).notNull(),
  coverUrl: numeric('cover_url', { precision: 20, scale: 4 }).notNull(),
  coverAlt: varchar('cover_alt', { length: 200 }).notNull(),
  author: varchar('author', { length: 180 }).notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  tags: text('tags').array().notNull(),
  seoTitle: varchar('seo_title', { length: 70 }).notNull(),
  seoDescription: varchar('seo_description', { length: 180 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyCharges = pgTable('agency_charges', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  client: varchar('client', { length: 180 }).notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  dueDate: date('due_date'),
  status: varchar('status', { length: 24 }).notNull(),
  paidAt: date('paid_at'),
  method: varchar('method', { length: 24 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  receipt: numeric('receipt', { precision: 20, scale: 4 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyChargesVersions = pgTable('agency_charges_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyCharges.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  client: varchar('client', { length: 180 }).notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  dueDate: date('due_date'),
  status: varchar('status', { length: 24 }).notNull(),
  paidAt: date('paid_at'),
  method: varchar('method', { length: 24 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  receipt: numeric('receipt', { precision: 20, scale: 4 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyTasks = pgTable('agency_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  dueDate: date('due_date'),
  status: varchar('status', { length: 24 }).notNull(),
  priority: varchar('priority', { length: 24 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyTasksVersions = pgTable('agency_tasks_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyTasks.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  dueDate: date('due_date'),
  status: varchar('status', { length: 24 }).notNull(),
  priority: varchar('priority', { length: 24 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyMessageTemplates = pgTable('agency_message_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  content: numeric('content', { precision: 20, scale: 4 }).notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyMessageTemplatesVersions = pgTable('agency_message_templates_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyMessageTemplates.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  content: numeric('content', { precision: 20, scale: 4 }).notNull(),
  category: varchar('category', { length: 180 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyAdsMetrics = pgTable('agency_ads_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  campaignId: varchar('campaign_id', { length: 180 }).notNull(),
  account: varchar('account', { length: 180 }).notNull(),
  date: date('metric_date'),
  costCents: bigint('cost_cents', { mode: 'number' }).notNull(),
  impressions: bigint('impressions', { mode: 'number' }).notNull(),
  clicks: bigint('clicks', { mode: 'number' }).notNull(),
  conversions: numeric('conversions', { precision: 20, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyAdsMetricsVersions = pgTable('agency_ads_metrics_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyAdsMetrics.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  campaignId: varchar('campaign_id', { length: 180 }).notNull(),
  account: varchar('account', { length: 180 }).notNull(),
  date: date('metric_date'),
  costCents: bigint('cost_cents', { mode: 'number' }).notNull(),
  impressions: bigint('impressions', { mode: 'number' }).notNull(),
  clicks: bigint('clicks', { mode: 'number' }).notNull(),
  conversions: numeric('conversions', { precision: 20, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyProjects = pgTable('agency_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  client: varchar('client', { length: 180 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  priority: varchar('priority', { length: 24 }).notNull(),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  progress: integer('progress').notNull(),
  budgetCents: bigint('budget_cents', { mode: 'number' }).notNull(),
  stack: numeric('stack', { precision: 20, scale: 4 }).notNull(),
  url: numeric('url', { precision: 20, scale: 4 }).notNull(),
  scope: numeric('scope', { precision: 20, scale: 4 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyProjectsVersions = pgTable('agency_projects_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyProjects.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  client: varchar('client', { length: 180 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  priority: varchar('priority', { length: 24 }).notNull(),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  progress: integer('progress').notNull(),
  budgetCents: bigint('budget_cents', { mode: 'number' }).notNull(),
  stack: numeric('stack', { precision: 20, scale: 4 }).notNull(),
  url: numeric('url', { precision: 20, scale: 4 }).notNull(),
  scope: numeric('scope', { precision: 20, scale: 4 }).notNull(),
  notes: numeric('notes', { precision: 20, scale: 4 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyConversations = pgTable('agency_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  version: integer('version').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  syncStatus: varchar('sync_status', { length: 32 }).notNull().default('not_applicable'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyConversationsVersions = pgTable('agency_conversations_versions', {
  documentId: uuid('document_id')
    .notNull()
    .references(() => agencyConversations.id),
  version: integer('version').notNull(),
  leadId: uuid('lead_id'),
  title: varchar('title', { length: 180 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
});
export const leadImportBatches = pgTable('lead_import_batches', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  fileHash: varchar('file_hash', { length: 64 }).notNull(),
  imported: integer('imported').notNull(),
  duplicates: integer('duplicates').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agencyOfflineConversions = pgTable('agency_offline_conversions', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  leadId: uuid('lead_id').notNull(),
  evidenceType: varchar('evidence_type', { length: 24 }).notNull(),
  evidenceId: uuid('evidence_id').notNull(),
  conversionAction: varchar('conversion_action', { length: 64 }).notNull(),
  transactionId: varchar('transaction_id', { length: 180 }).notNull().unique(),
  gclidCiphertext: text('gclid_ciphertext').notNull(),
  valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('queued'),
  validateOnly: boolean('validate_only').notNull().default(true),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  requestId: varchar('request_id', { length: 180 }),
  warningCount: integer('warning_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  lastError: varchar('last_error', { length: 180 }),
  diagnosticAttempts: integer('diagnostic_attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

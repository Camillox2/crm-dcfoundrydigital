import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

/**
 * Tipo customizado para pgvector (embeddings de 768 dimensões — Gemini text-embedding-004 / Xenova)
 */
export const vector768 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .filter(Boolean)
      .map(Number);
  },
});

// ============================================================================
// 1. USUÁRIOS, PAPÉIS (RBAC) E SESSÕES DE AUTENTICAÇÃO
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 180 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    teamId: uuid('team_id'),
    totpEnabled: boolean('totp_enabled').default(false).notNull(),
    totpSecretEncrypted: jsonb('totp_secret_encrypted'),
    isActive: boolean('is_active').default(true).notNull(),
    xpPoints: integer('xp_points').default(0).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), index('users_team_idx').on(t.teamId)],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    description: text('description'),
    permissionsJson: jsonb('permissions_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('roles_slug_uq').on(t.slug)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('user_roles_user_role_uq').on(t.userId, t.roleId)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_hash_uq').on(t.refreshTokenHash),
    index('auth_sessions_user_idx').on(t.userId),
  ],
);

// ============================================================================
// 2. AUDITORIA IMUTÁVEL E CONFORMIDADE LGPD
// ============================================================================

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorType: varchar('actor_type', { length: 32 }).notNull(), // 'user' | 'ai_agent' | 'system' | 'webhook'
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 120 }).notNull(), // ex: 'lead.create', 'contract.approve', 'auth.login'
    entityType: varchar('entity_type', { length: 80 }).notNull(),
    entityId: varchar('entity_id', { length: 120 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    diffJson: jsonb('diff_json').notNull(), // { campo: { before, after } }
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

export const lgpdConsents = pgTable(
  'lgpd_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id'),
    purpose: varchar('purpose', { length: 80 }).notNull(), // 'whatsapp_opt_in' | 'marketing_cookies' | 'health_data_art11'
    legalBasis: varchar('legal_basis', { length: 80 }).notNull(), // 'consent' | 'contract_execution' | 'health_protection'
    granted: boolean('granted').notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    evidenceText: text('evidence_text'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('lgpd_consents_contact_idx').on(t.contactId)],
);

// ============================================================================
// 3. CONTATOS E CLIENTES (PF/PJ + DADOS SENSÍVEIS DE SAÚDE CRIPTOGRAFADOS)
// ============================================================================

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    personType: varchar('person_type', { length: 16 }).default('PF').notNull(), // 'PF' | 'PJ'
    profileRole: varchar('profile_role', { length: 40 }).default('family_guardian').notNull(), // 'patient' | 'family_guardian' | 'hospital' | 'clinic'
    fullName: varchar('full_name', { length: 180 }).notNull(),
    phoneE164: varchar('phone_e164', { length: 24 }).notNull(),
    email: varchar('email', { length: 255 }),
    documentEncrypted: jsonb('document_encrypted'), // CPF/CNPJ criptografado AES-256-GCM
    city: varchar('city', { length: 120 }),
    neighborhood: varchar('neighborhood', { length: 120 }),
    addressLine: text('address_line'),
    postalCode: varchar('postal_code', { length: 16 }),
    whatsappOptIn: boolean('whatsapp_opt_in').default(true).notNull(),
    aiPaused: boolean('ai_paused').default(false).notNull(), // Herdado DC Foundry Admin: pausa IA por contato
    aiPausedReason: text('ai_paused_reason'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('contacts_phone_e164_uq').on(t.phoneE164),
    index('contacts_owner_idx').on(t.ownerId),
  ],
);

export const patientHealthProfiles = pgTable('patient_health_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  // Dados clínicos sensíveis (Art. 11 LGPD) sempre em AES-256-GCM (diagnóstico, mobilidade, peso, alta hospitalar)
  encryptedClinicalNotes: jsonb('encrypted_clinical_notes').notNull(),
  healthInsuranceName: varchar('health_insurance_name', { length: 120 }),
  hospitalDischargeUrgency: boolean('hospital_discharge_urgency').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 4. MARKETING, GOOGLE ADS E ATRIBUIÇÃO PONTA A PONTA
// ============================================================================

export const marketingTouchpoints = pgTable(
  'marketing_touchpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    trackingCode: varchar('tracking_code', { length: 32 }).notNull(), // Código curto anexado no WhatsApp / Form
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id'),
    touchType: varchar('touch_type', { length: 24 }).default('first_touch').notNull(), // 'first_touch' | 'last_touch' | 'middle'
    utmSource: varchar('utm_source', { length: 120 }),
    utmMedium: varchar('utm_medium', { length: 120 }),
    utmCampaign: varchar('utm_campaign', { length: 180 }),
    utmTerm: varchar('utm_term', { length: 180 }),
    utmContent: varchar('utm_content', { length: 180 }),
    gclid: varchar('gclid', { length: 255 }),
    gbraid: varchar('gbraid', { length: 255 }),
    wbraid: varchar('wbraid', { length: 255 }),
    fbclid: varchar('fbclid', { length: 255 }),
    landingPage: text('landing_page'),
    referrer: text('referrer'),
    consentAdStorage: boolean('consent_ad_storage').default(true).notNull(),
    consentAnalyticsStorage: boolean('consent_analytics_storage').default(true).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('marketing_touchpoints_code_uq').on(t.trackingCode),
    index('marketing_touchpoints_gclid_idx').on(t.gclid),
    index('marketing_touchpoints_campaign_idx').on(t.utmCampaign),
  ],
);

export const adCampaignsDailyMetrics = pgTable(
  'ad_campaigns_daily_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    metricDate: date('metric_date').notNull(),
    campaignId: varchar('campaign_id', { length: 80 }).notNull(),
    campaignName: varchar('campaign_name', { length: 180 }).notNull(),
    adGroupId: varchar('ad_group_id', { length: 80 }),
    keywordText: varchar('keyword_text', { length: 180 }),
    impressions: integer('impressions').default(0).notNull(),
    clicks: integer('clicks').default(0).notNull(),
    costCents: integer('cost_cents').default(0).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ad_metrics_date_campaign_idx').on(t.metricDate, t.campaignName)],
);

export const offlineConversionUploads = pgTable(
  'offline_conversion_uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id').notNull(),
    contractId: uuid('contract_id'),
    conversionName: varchar('conversion_name', { length: 80 }).notNull(), // 'lead_qualificado' | 'contrato_fechado'
    gclid: varchar('gclid', { length: 255 }),
    hashedPhoneSha256: varchar('hashed_phone_sha256', { length: 64 }),
    hashedEmailSha256: varchar('hashed_email_sha256', { length: 64 }),
    conversionValueCents: integer('conversion_value_cents').default(0).notNull(),
    currencyCode: varchar('currency_code', { length: 8 }).default('BRL').notNull(),
    status: varchar('status', { length: 32 }).default('pending').notNull(), // 'pending' | 'uploaded' | 'failed'
    attempts: integer('attempts').default(0).notNull(),
    lastErrorMessage: text('last_error_message'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('offline_conversions_status_idx').on(t.status)],
);

// ============================================================================
// 5. PIPELINES, ETAPAS, LEADS E TAREFAS
// ============================================================================

export const pipelines = pgTable('pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  version:integer('version').notNull().default(1),
  name: varchar('name', { length: 120 }).notNull(), // 'Locação Home Care', 'Venda de Equipamentos', 'Pós-venda / Renovação'
  slug: varchar('slug', { length: 80 }).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug:varchar('slug',{length:32}).notNull(),
    position: integer('position').notNull(),
    slaMinutes: integer('sla_minutes').default(30).notNull(),
    colorHex: varchar('color_hex', { length: 16 }).default('#1D5FAE').notNull(),
    isWon: boolean('is_won').default(false).notNull(),
    isLost: boolean('is_lost').default(false).notNull(),
  },
  (t) => [index('pipeline_stages_pipeline_pos_idx').on(t.pipelineId, t.position)],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    teamId: uuid('team_id'),
    title: varchar('title', { length: 200 }).notNull(),
    modality: varchar('modality', { length: 24 }).default('rental').notNull(), // 'rental' | 'sale' | 'both'
    requestedEquipmentSummary: text('requested_equipment_summary'),
    rentalPeriodDays: integer('rental_period_days'),
    qualificationScore: integer('qualification_score').default(0).notNull(), // 0 a 100
    temperature: varchar('temperature', { length: 16 }).default('warm').notNull(), // 'cold' | 'warm' | 'hot'
    urgencyLevel: varchar('urgency_level', { length: 24 }).default('normal').notNull(), // 'low' | 'normal' | 'high' | 'hospital_discharge'
    sourceChannel: varchar('source_channel', { length: 64 }).default('whatsapp').notNull(),
    attributedCampaign: varchar('attributed_campaign', { length: 180 }),
    gclid: varchar('gclid', { length: 255 }),
    estimatedValueCents: integer('estimated_value_cents').default(0).notNull(),
    lostReason: text('lost_reason'),
    firstResponseSeconds: integer('first_response_seconds'),
    firstRespondedBy: varchar('first_responded_by', { length: 16 }), // 'ai' | 'human'
    tags: jsonb('tags').default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('leads_pipeline_stage_idx').on(t.pipelineId, t.stageId),
    index('leads_owner_idx').on(t.ownerId),
    index('leads_campaign_idx').on(t.attributedCampaign),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    taskType: varchar('task_type', { length: 40 }).default('follow_up').notNull(), // 'follow_up' | 'call' | 'delivery' | 'pickup' | 'renewal'
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    recurrenceRule: varchar('recurrence_rule', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('tasks_assigned_due_idx').on(t.assignedToId, t.dueAt)],
);

// ============================================================================
// 6. WHATSAPP MULTI-SESSÃO (BAILEYS) E INBOX UNIFICADA
// ============================================================================

export const whatsappSessions = pgTable('whatsapp_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: varchar('label', { length: 120 }).notNull(), // ex: 'Comercial Principal', 'Plantão Locação'
  phoneE164: varchar('phone_e164', { length: 24 }),
  providerType: varchar('provider_type', { length: 32 }).default('baileys').notNull(), // 'baileys' | 'cloud_api'
  status: varchar('status', { length: 32 }).default('disconnected').notNull(), // 'disconnected' | 'qr_ready' | 'connected' | 'reconnecting'
  aiEnabled: boolean('ai_enabled').default(true).notNull(),
  businessHoursJson: jsonb('business_hours_json').notNull(),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappAuthCredentials = pgTable(
  'whatsapp_auth_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => whatsappSessions.id, { onDelete: 'cascade' }),
    credentialKey: varchar('credential_key', { length: 160 }).notNull(),
    encryptedPayload: jsonb('encrypted_payload').notNull(), // AES-256-GCM
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('wa_auth_session_key_uq').on(t.sessionId, t.credentialKey)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => whatsappSessions.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).default('ai_handling').notNull(), // 'ai_handling' | 'waiting_human' | 'human_assigned' | 'resolved'
    unreadCount: integer('unread_count').default(0).notNull(),
    lastMessagePreview: text('last_message_preview'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('conversations_status_last_msg_idx').on(t.status, t.lastMessageAt),
    index('conversations_contact_idx').on(t.contactId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    externalMessageId: varchar('external_message_id', { length: 160 }),
    direction: varchar('direction', { length: 16 }).notNull(), // 'inbound' | 'outbound' | 'internal_note'
    senderType: varchar('sender_type', { length: 24 }).notNull(), // 'contact' | 'human_agent' | 'ai_agent' | 'system'
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    mediaType: varchar('media_type', { length: 24 }).default('text').notNull(), // 'text' | 'image' | 'audio' | 'video' | 'document' | 'location'
    bodyText: text('body_text'),
    audioTranscription: text('audio_transcription'), // Whisper
    mediaSignedUrl: text('media_signed_url'),
    deliveryStatus: varchar('delivery_status', { length: 24 }).default('sent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('messages_conversation_created_idx').on(t.conversationId, t.createdAt)],
);

// ============================================================================
// 7. AGENTE DE IA, RAG (PGVECTOR), MEMÓRIA E AUDITORIA DE IA
// ============================================================================

export const aiAgentConfigs = pgTable('ai_agent_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => whatsappSessions.id, { onDelete: 'cascade' }),
  version: integer('version').default(1).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  primaryProvider: varchar('primary_provider', { length: 32 }).default('gemini').notNull(),
  fallbackProvider: varchar('fallback_provider', { length: 32 }).default('ollama').notNull(),
  handoffKeywords: jsonb('handoff_keywords').default([]).notNull(),
  minConfidenceThreshold: numeric('min_confidence_threshold', { precision: 4, scale: 2 }).default('0.72').notNull(),
  maxDailyTokens: integer('max_daily_tokens').default(250000).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kbDocuments = pgTable('kb_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 64 }).notNull(), // 'catalog' | 'pricing' | 'faq' | 'contract_policy'
  sourceFilename: varchar('source_filename', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kbChunks = pgTable(
  'kb_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => kbDocuments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    contentText: text('content_text').notNull(),
    embedding: vector768('embedding').notNull(),
    metadataJson: jsonb('metadata_json'),
  },
  (t) => [index('kb_chunks_document_idx').on(t.documentId)],
);

export const aiClientMemories = pgTable(
  'ai_client_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    memorySummary: text('memory_summary').notNull(),
    extractedFactsJson: jsonb('extracted_facts_json').default({}).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('ai_client_memories_contact_uq').on(t.contactId)],
);

export const aiAuditLogs = pgTable('ai_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  providerUsed: varchar('provider_used', { length: 32 }).notNull(),
  modelName: varchar('model_name', { length: 80 }).notNull(),
  promptVersion: integer('prompt_version').notNull(),
  maskedInputText: text('masked_input_text').notNull(),
  outputText: text('output_text').notNull(),
  citedChunkIds: jsonb('cited_chunk_Ids').default([]).notNull(),
  toolCallsJson: jsonb('tool_calls_json').default([]).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  triggeredHandoff: boolean('triggered_handoff').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 8. CATÁLOGO DE PRODUTOS E ESTOQUE DE EQUIPAMENTOS SERIALIZADOS
// ============================================================================

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sku: varchar('sku', { length: 64 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(), // ex: 'Cama Hospitalar Motorizada 3 Movimentos'
    category: varchar('category', { length: 64 }).notNull(), // 'bed' | 'mattress' | 'wheelchair' | 'oxygen' | 'accessory'
    description: text('description'),
    salePriceCents: integer('sale_price_cents'),
    dailyRentalCents: integer('daily_rental_cents'),
    weeklyRentalCents: integer('weekly_rental_cents'),
    monthlyRentalCents: integer('monthly_rental_cents').notNull(),
    depositCautionCents: integer('deposit_caution_cents').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('products_sku_uq').on(t.sku)],
);

export const equipmentUnits = pgTable(
  'equipment_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    serialNumber: varchar('serial_number', { length: 80 }).notNull(),
    assetTag: varchar('asset_tag', { length: 64 }).notNull(), // Patrimônio
    status: varchar('status', { length: 32 }).default('available').notNull(), // 'available' | 'rented' | 'maintenance' | 'sanitization'
    conditionNotes: text('condition_notes'),
    lastSanitizedAt: timestamp('last_sanitized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('equipment_units_serial_uq').on(t.serialNumber),
    uniqueIndex('equipment_units_asset_tag_uq').on(t.assetTag),
    index('equipment_units_product_status_idx').on(t.productId, t.status),
  ],
);

// ============================================================================
// 9. ORÇAMENTOS, CONTRATOS DE LOCAÇÃO E RESERVAS SEM SOBREPOSIÇÃO
// ============================================================================

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publicToken: varchar('public_token', { length: 64 }).notNull(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 32 }).default('draft').notNull(), // 'draft' | 'sent' | 'accepted' | 'expired'
    subtotalCents: integer('subtotal_cents').notNull(),
    freightCents: integer('freight_cents').default(0).notNull(),
    discountCents: integer('discount_cents').default(0).notNull(),
    totalCents: integer('total_cents').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('quotes_public_token_uq').on(t.publicToken)],
);

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractCode: varchar('contract_code', { length: 40 }).notNull(),
    publicSignToken: varchar('public_sign_token', { length: 64 }).notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).default('pending_signature').notNull(), // 'pending_signature' | 'active' | 'due_renewal' | 'overdue' | 'returned' | 'cancelled'
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expectedReturnAt: timestamp('expected_return_at', { withTimezone: true }).notNull(),
    actualReturnedAt: timestamp('actual_returned_at', { withTimezone: true }),
    deliveryAddress: text('delivery_address').notNull(),
    monthlyValueCents: integer('monthly_value_cents').notNull(),
    cautionDepositCents: integer('caution_deposit_cents').default(0).notNull(),
    signedByFullName: varchar('signed_by_full_name', { length: 180 }),
    signedByIp: varchar('signed_by_ip', { length: 64 }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('contracts_code_uq').on(t.contractCode),
    uniqueIndex('contracts_sign_token_uq').on(t.publicSignToken),
    index('contracts_status_return_idx').on(t.status, t.expectedReturnAt),
  ],
);

export const equipmentReservations = pgTable(
  'equipment_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    equipmentUnitId: uuid('equipment_unit_id')
      .notNull()
      .references(() => equipmentUnits.id, { onDelete: 'restrict' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('eq_reservations_unit_dates_idx').on(t.equipmentUnitId, t.startsAt, t.endsAt)],
);

// ============================================================================
// 10. LOGÍSTICA (ENTREGAS, RETIRADAS E CHECKLIST COM FOTOS) E FINANCEIRO
// ============================================================================

export const logisticsOrders = pgTable('logistics_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  orderType: varchar('order_type', { length: 24 }).notNull(), // 'delivery' | 'pickup' | 'maintenance_swap'
  scheduledDate: timestamp('scheduled_date', { withTimezone: true }).notNull(),
  driverUserId: uuid('driver_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 32 }).default('scheduled').notNull(), // 'scheduled' | 'in_route' | 'completed'
  checklistJson: jsonb('checklist_json').default({}).notNull(),
  photosUrlsJson: jsonb('photos_urls_json').default([]).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    dueDate: date('due_date').notNull(),
    status: varchar('status', { length: 32 }).default('pending').notNull(), // 'pending' | 'paid' | 'overdue' | 'cancelled'
    paymentMethod: varchar('payment_method', { length: 24 }).default('pix').notNull(), // 'pix' | 'boleto' | 'card'
    mercadoPagoPaymentId: varchar('mercado_pago_payment_id', { length: 120 }),
    pixCopyPaste: text('pix_copy_paste'),
    boletoUrl: text('boleto_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('invoices_status_due_idx').on(t.status, t.dueDate)],
);

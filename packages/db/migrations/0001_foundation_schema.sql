-- ============================================================================
-- Migration 0001: Fundação Relacional do DC Foundry Digital CRM
-- Substitui o legado crm_records JSONB por integridade referencial, pgvector,
-- reserva de equipamentos sem sobreposição (btree_gist) e audit_logs imutável.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL UNIQUE,
  "full_name" varchar(180) NOT NULL,
  "password_hash" text NOT NULL,
  "team_id" uuid,
  "totp_enabled" boolean NOT NULL DEFAULT false,
  "totp_secret_encrypted" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "xp_points" integer NOT NULL DEFAULT 0,
  "last_login_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(64) NOT NULL UNIQUE,
  "display_name" varchar(120) NOT NULL,
  "description" text,
  "permissions_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "role_id")
);

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token_hash" varchar(128) NOT NULL UNIQUE,
  "ip_address" varchar(64),
  "user_agent" text,
  "revoked_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_type" varchar(32) NOT NULL,
  "actor_id" uuid,
  "action" varchar(120) NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" varchar(120) NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "diff_json" jsonb NOT NULL,
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at" DESC);

-- Trigger de imutabilidade no audit_logs (proíbe UPDATE e DELETE)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é uma tabela imutável (append-only). Operação % bloqueada.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON "audit_logs";
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" varchar(64) NOT NULL UNIQUE,
  "name" varchar(180) NOT NULL,
  "category" varchar(64) NOT NULL,
  "description" text,
  "sale_price_cents" integer,
  "daily_rental_cents" integer,
  "weekly_rental_cents" integer,
  "monthly_rental_cents" integer NOT NULL,
  "deposit_caution_cents" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "equipment_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "serial_number" varchar(80) NOT NULL UNIQUE,
  "asset_tag" varchar(64) NOT NULL UNIQUE,
  "status" varchar(32) NOT NULL DEFAULT 'available',
  "condition_notes" text,
  "last_sanitized_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "person_type" varchar(16) NOT NULL DEFAULT 'PF',
  "profile_role" varchar(40) NOT NULL DEFAULT 'family_guardian',
  "full_name" varchar(180) NOT NULL,
  "phone_e164" varchar(24) NOT NULL UNIQUE,
  "email" varchar(255),
  "document_encrypted" jsonb,
  "city" varchar(120),
  "neighborhood" varchar(120),
  "address_line" text,
  "postal_code" varchar(16),
  "whatsapp_opt_in" boolean NOT NULL DEFAULT true,
  "ai_paused" boolean NOT NULL DEFAULT false,
  "ai_paused_reason" text,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "anonymized_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_code" varchar(40) NOT NULL UNIQUE,
  "public_sign_token" varchar(64) NOT NULL UNIQUE,
  "lead_id" uuid,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "quote_id" uuid,
  "status" varchar(32) NOT NULL DEFAULT 'pending_signature',
  "starts_at" timestamptz NOT NULL,
  "expected_return_at" timestamptz NOT NULL,
  "actual_returned_at" timestamptz,
  "delivery_address" text NOT NULL,
  "monthly_value_cents" integer NOT NULL,
  "caution_deposit_cents" integer NOT NULL DEFAULT 0,
  "signed_by_full_name" varchar(180),
  "signed_by_ip" varchar(64),
  "signed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Reserva de equipamentos com restrição GiST anti-sobreposição de datas
CREATE TABLE IF NOT EXISTS "equipment_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "equipment_unit_id" uuid NOT NULL REFERENCES "equipment_units"("id") ON DELETE RESTRICT,
  "contract_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "eq_reservations_valid_period_chk" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "eq_reservations_no_overlap_excl"
    EXCLUDE USING gist (
      "equipment_unit_id" WITH =,
      tstzrange("starts_at", "ends_at", '[)') WITH &&
    ) WHERE ("is_active" = true)
);

-- Índices HNSW em pgvector para RAG de baixa latência (<10ms)
CREATE TABLE IF NOT EXISTS "kb_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(200) NOT NULL,
  "category" varchar(64) NOT NULL,
  "source_filename" varchar(255),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "kb_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "kb_documents"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "content_text" text NOT NULL,
  "embedding" vector(768) NOT NULL,
  "metadata_json" jsonb
);

CREATE INDEX IF NOT EXISTS "kb_chunks_embedding_hnsw_idx"
  ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);

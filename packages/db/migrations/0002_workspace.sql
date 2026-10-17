-- Real workspace records. No demo clients, contracts, invoices or campaigns.
CREATE TABLE IF NOT EXISTS workspace_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name varchar(180) NOT NULL,
  company varchar(180) NOT NULL,
  phone varchar(24) NOT NULL,
  scope_summary text NOT NULL DEFAULT '',
  modality varchar(24) NOT NULL DEFAULT 'Projeto Fechado',
  monthly_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_value >= 0),
  notes text NOT NULL DEFAULT '',
  high_priority boolean NOT NULL DEFAULT false,
  stage varchar(32) NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo','qualificado_ia','orcamento','contrato_ativo')),
  avatar_url text,
  avatar_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_leads_owner_updated_idx ON workspace_leads(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, position integer NOT NULL, sla_minutes integer NOT NULL DEFAULT 30,
  color_hex varchar(16) NOT NULL DEFAULT '#1D5FAE', is_won boolean NOT NULL DEFAULT false, is_lost boolean NOT NULL DEFAULT false,
  UNIQUE(pipeline_id,position)
);

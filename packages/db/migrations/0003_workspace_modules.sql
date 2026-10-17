ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS workspace_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind varchar(24) NOT NULL CHECK (kind IN ('blog','contract','invoice','task','template','campaign','knowledge','assistant','conversation')),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 lead_id uuid REFERENCES workspace_leads(id) ON DELETE RESTRICT,
 data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
 version integer NOT NULL DEFAULT 1,
 archived_at timestamptz, published_at timestamptz,
 sync_status varchar(32) NOT NULL DEFAULT 'not_configured',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_documents_list_idx ON workspace_documents(kind,owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_documents_lead_idx ON workspace_documents(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_blog_slug_uq ON workspace_documents((data->>'slug')) WHERE kind='blog';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_campaign_day_uq ON workspace_documents((data->>'campaignId'),(data->>'account'),(data->>'date')) WHERE kind='campaign' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_blog_public_idx ON workspace_documents((data->>'status'),published_at DESC) WHERE kind='blog' AND archived_at IS NULL;
CREATE TABLE IF NOT EXISTS workspace_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,
 version integer NOT NULL, data jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), saved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version)
);
CREATE TABLE IF NOT EXISTS workspace_blog_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,
 slugs jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, last_error varchar(200), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_blog_outbox_pending_idx ON workspace_blog_outbox(next_attempt_at) WHERE delivered_at IS NULL;

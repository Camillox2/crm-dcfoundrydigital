ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS campaign varchar(150) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS gclid varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_documents DROP CONSTRAINT IF EXISTS workspace_documents_kind_check;
ALTER TABLE workspace_documents ADD CONSTRAINT workspace_documents_kind_check
 CHECK (kind IN ('blog','contract','invoice','task','template','campaign','knowledge','assistant','conversation','project'));
CREATE INDEX IF NOT EXISTS workspace_documents_due_idx ON workspace_documents(kind,(data->>'dueDate')) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS workspace_site_events (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 event varchar(80) NOT NULL,
 path varchar(300) NOT NULL,
 source varchar(100) NOT NULL DEFAULT '',
 medium varchar(100) NOT NULL DEFAULT '',
 campaign varchar(150) NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_site_events_period_idx ON workspace_site_events(owner_id,occurred_at DESC);

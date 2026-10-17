CREATE TABLE IF NOT EXISTS workspace_site_intakes (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 lead_id uuid REFERENCES workspace_leads(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);

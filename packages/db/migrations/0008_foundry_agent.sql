CREATE TABLE foundry_knowledge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),title varchar(180) NOT NULL,
 content text NOT NULL,category varchar(180) NOT NULL,audience varchar(16) NOT NULL DEFAULT 'public' CHECK(audience IN ('public','internal')),
 version integer NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foundry_guidance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),title varchar(180) NOT NULL,
 instructions text NOT NULL,tone varchar(16) NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foundry_knowledge_versions (
 document_id uuid NOT NULL REFERENCES foundry_knowledge(id),version integer NOT NULL,title varchar(180) NOT NULL,content text NOT NULL,category varchar(180) NOT NULL,audience varchar(16) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version)
);
CREATE TABLE foundry_guidance_versions (
 document_id uuid NOT NULL REFERENCES foundry_guidance(id),version integer NOT NULL,title varchar(180) NOT NULL,instructions text NOT NULL,tone varchar(16) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version)
);
INSERT INTO foundry_knowledge(id,owner_id,title,content,category,version,archived_at,created_at,updated_at)
 SELECT id,owner_id,data->>'title',data->>'content',COALESCE(data->>'category','Empresa'),version,archived_at,created_at,updated_at FROM workspace_documents WHERE kind='knowledge';
INSERT INTO foundry_guidance(id,owner_id,title,instructions,tone,version,archived_at,created_at,updated_at)
 SELECT id,owner_id,data->>'title',data->>'instructions',COALESCE(data->>'tone','friendly'),version,archived_at,created_at,updated_at FROM workspace_documents WHERE kind='assistant';
INSERT INTO foundry_knowledge_versions(document_id,version,title,content,category,audience,actor_id,saved_at)
 SELECT v.document_id,v.version,v.data->>'title',v.data->>'content',COALESCE(v.data->>'category','Empresa'),'public',v.actor_id,v.saved_at FROM workspace_document_versions v JOIN foundry_knowledge k ON k.id=v.document_id;
INSERT INTO foundry_guidance_versions(document_id,version,title,instructions,tone,actor_id,saved_at)
 SELECT v.document_id,v.version,v.data->>'title',v.data->>'instructions',COALESCE(v.data->>'tone','friendly'),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN foundry_guidance k ON k.id=v.document_id;
CREATE TABLE foundry_settings (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),whatsapp_enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO foundry_settings(singleton) VALUES(true);
ALTER TABLE workspace_leads ADD COLUMN project_type varchar(32);
ALTER TABLE workspace_leads ADD COLUMN objective text;
ALTER TABLE workspace_leads ADD COLUMN budget_cents bigint;
ALTER TABLE workspace_leads ADD COLUMN deadline_text varchar(300);
ALTER TABLE workspace_leads ADD COLUMN decision_maker varchar(180);
ALTER TABLE workspace_leads ADD COLUMN urgency varchar(24);
ALTER TABLE workspace_leads ADD COLUMN ai_paused boolean NOT NULL DEFAULT false;
ALTER TABLE workspace_leads ADD COLUMN ai_control_revision integer NOT NULL DEFAULT 1;
ALTER TABLE workspace_leads ADD COLUMN handoff_reason varchar(180);
ALTER TABLE workspace_leads ADD COLUMN ai_summary text;
ALTER TABLE workspace_leads ADD COLUMN ai_summary_at timestamptz;
ALTER TABLE wa_commands ADD COLUMN lead_id uuid REFERENCES workspace_leads(id);
ALTER TABLE wa_commands ADD COLUMN ai_revision integer;
ALTER TABLE wa_commands ADD COLUMN handoff_ack boolean NOT NULL DEFAULT false;
ALTER TABLE wa_commands ADD COLUMN cancelled_at timestamptz;
CREATE TABLE foundry_turns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid NOT NULL UNIQUE REFERENCES wa_messages(id),lead_id uuid NOT NULL REFERENCES workspace_leads(id),
 control_revision integer NOT NULL,state varchar(24) NOT NULL DEFAULT 'processing',answer text,model varchar(120),handoff boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
CREATE INDEX foundry_turns_lead_idx ON foundry_turns(lead_id,created_at DESC);
CREATE TABLE foundry_lab_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES users(id),scenario_slug varchar(80) NOT NULL,
 answer text NOT NULL,model varchar(120) NOT NULL,handoff boolean NOT NULL,passed boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);

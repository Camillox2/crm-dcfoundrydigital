ALTER TABLE foundry_settings ADD COLUMN website_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE website_chat_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES workspace_leads(id),owner_id uuid NOT NULL REFERENCES users(id),
 token_hash varchar(64) NOT NULL UNIQUE,visitor_hash varchar(64) NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 path varchar(500) NOT NULL DEFAULT '/',created_at timestamptz NOT NULL DEFAULT now(),last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX website_chat_visitor_idx ON website_chat_sessions(visitor_hash,created_at);
CREATE TABLE website_chat_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES website_chat_sessions(id),lead_id uuid NOT NULL REFERENCES workspace_leads(id),
 role varchar(16) NOT NULL CHECK(role IN('contact','foundry','human')),actor_id uuid REFERENCES users(id),body text NOT NULL,
 request_key uuid,reply_to_id uuid UNIQUE REFERENCES website_chat_messages(id),turn_state varchar(24) NOT NULL DEFAULT 'completed',model varchar(180),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,request_key)
);
CREATE INDEX website_chat_messages_session_idx ON website_chat_messages(session_id,created_at);
CREATE INDEX agency_whatsapp_human_sla_idx ON wa_messages(lead_id,sent_at) WHERE historical=false;

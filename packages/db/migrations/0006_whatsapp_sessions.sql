CREATE TABLE wa_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
 provider varchar(16) NOT NULL DEFAULT 'baileys' CHECK(provider IN ('baileys','meta')),
 status varchar(24) NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','connecting','qr','pairing','connected','reconnecting','logged_out','error')),
 generation integer NOT NULL DEFAULT 1, phone varchar(24), qr text, pairing_code varchar(40), credentials_expires_at timestamptz,
 import_history boolean NOT NULL DEFAULT false, history_progress integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT true, heartbeat_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_sessions_owner_idx ON wa_sessions(owner_id);
CREATE TABLE wa_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES wa_sessions(id),
 lead_id uuid NOT NULL REFERENCES workspace_leads(id), jid varchar(160) NOT NULL, phone_e164 varchar(24),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,jid)
);
CREATE INDEX wa_identities_lead_idx ON wa_identities(lead_id);
CREATE INDEX wa_identities_phone_idx ON wa_identities(session_id,phone_e164);
CREATE TABLE wa_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES wa_sessions(id),
 lead_id uuid NOT NULL REFERENCES workspace_leads(id), external_id varchar(200) NOT NULL,
 jid varchar(160) NOT NULL, direction varchar(16) NOT NULL CHECK(direction IN ('inbound','outbound')),
 actor_type varchar(16) NOT NULL CHECK(actor_type IN ('human','foundry','contact')), actor_id uuid REFERENCES users(id),
 body text NOT NULL DEFAULT '', historical boolean NOT NULL DEFAULT false,
 sent_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,jid,external_id)
);
CREATE INDEX wa_messages_lead_date_idx ON wa_messages(lead_id,sent_at DESC);
CREATE TABLE wa_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES wa_sessions(id), generation integer NOT NULL,
 command_type varchar(24) NOT NULL, phone varchar(24), message_id uuid REFERENCES wa_messages(id), jid varchar(160), body text,
 anchor_id varchar(200), anchor_from_me boolean, anchor_timestamp bigint,
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_commands_pending_idx ON wa_commands(created_at) WHERE published_at IS NULL;
CREATE TABLE wa_event_receipts (id uuid PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());

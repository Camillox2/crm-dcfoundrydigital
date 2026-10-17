-- A conversation groups aliases of the same contact within the paired session.
CREATE TABLE wa_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES wa_sessions(id),
 lead_id uuid NOT NULL REFERENCES workspace_leads(id),
 ai_enabled boolean NOT NULL DEFAULT true,
 control_revision integer NOT NULL DEFAULT 1,
 last_message_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT wa_conversations_session_lead_uq UNIQUE(session_id,lead_id)
);
INSERT INTO wa_conversations(session_id,lead_id,ai_enabled,control_revision,last_message_at)
 SELECT x.session_id,x.lead_id,NOT l.ai_paused,l.ai_control_revision,
 (SELECT max(sent_at) FROM wa_messages m WHERE m.session_id=x.session_id AND m.lead_id=x.lead_id)
 FROM (SELECT session_id,lead_id FROM wa_identities UNION SELECT session_id,lead_id FROM wa_messages) x
 JOIN workspace_leads l ON l.id=x.lead_id;

CREATE FUNCTION dc_wa_conversation_for_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO wa_conversations(session_id,lead_id,ai_enabled,control_revision,last_message_at)
 SELECT NEW.session_id,NEW.lead_id,NOT ai_paused,ai_control_revision,NEW.sent_at FROM workspace_leads WHERE id=NEW.lead_id
 ON CONFLICT(session_id,lead_id) DO UPDATE SET
 last_message_at=GREATEST(wa_conversations.last_message_at,EXCLUDED.last_message_at),updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER wa_message_conversation BEFORE INSERT ON wa_messages FOR EACH ROW EXECUTE FUNCTION dc_wa_conversation_for_message();
CREATE TRIGGER wa_message_conversation_time AFTER UPDATE OF sent_at ON wa_messages FOR EACH ROW EXECUTE FUNCTION dc_wa_conversation_for_message();

CREATE FUNCTION dc_wa_conversation_for_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO wa_conversations(session_id,lead_id,ai_enabled,control_revision)
 SELECT NEW.session_id,NEW.lead_id,NOT ai_paused,ai_control_revision FROM workspace_leads WHERE id=NEW.lead_id
 ON CONFLICT(session_id,lead_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER wa_identity_conversation AFTER INSERT ON wa_identities FOR EACH ROW EXECUTE FUNCTION dc_wa_conversation_for_identity();

-- The existing contact control also updates the durable per-conversation hook.
-- Global Foundry enablement remains separate and starts disabled.
CREATE FUNCTION dc_wa_conversation_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE wa_conversations SET ai_enabled=NOT NEW.ai_paused,control_revision=NEW.ai_control_revision,updated_at=now() WHERE lead_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER wa_lead_conversation_control AFTER UPDATE OF ai_paused,ai_control_revision ON workspace_leads FOR EACH ROW EXECUTE FUNCTION dc_wa_conversation_control();
ALTER TABLE wa_messages ADD CONSTRAINT wa_messages_conversation_fk FOREIGN KEY(session_id,lead_id) REFERENCES wa_conversations(session_id,lead_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE wa_identities ADD CONSTRAINT wa_identities_conversation_fk FOREIGN KEY(session_id,lead_id) REFERENCES wa_conversations(session_id,lead_id) DEFERRABLE INITIALLY DEFERRED;

-- Native indexes for scoped conversation listing and the transactional send limit.
CREATE INDEX IF NOT EXISTS wa_messages_session_lead_date_idx ON wa_messages(session_id,lead_id,sent_at DESC);
CREATE INDEX IF NOT EXISTS wa_commands_send_window_idx ON wa_commands(session_id,created_at DESC) WHERE command_type='send';

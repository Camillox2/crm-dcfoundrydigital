-- Inbox state for WhatsApp conversations. Forward-only and idempotent.
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_conversations_status_chk') THEN
    ALTER TABLE wa_conversations
      ADD CONSTRAINT wa_conversations_status_chk CHECK (status IN ('open', 'closed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wa_conversations_session_status_last_idx
  ON wa_conversations (session_id, status, last_message_at DESC);

UPDATE wa_conversations c
SET last_inbound_at = src.last_inbound
FROM (
  SELECT session_id, lead_id, max(sent_at) AS last_inbound
  FROM wa_messages
  WHERE direction = 'inbound'
  GROUP BY session_id, lead_id
) src
WHERE c.session_id = src.session_id
  AND c.lead_id = src.lead_id
  AND c.last_inbound_at IS NULL;

CREATE OR REPLACE FUNCTION dc_wa_conversation_for_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wa_conversations(session_id, lead_id, ai_enabled, control_revision, last_message_at, last_inbound_at, status)
  SELECT NEW.session_id, NEW.lead_id, NOT ai_paused, ai_control_revision, NEW.sent_at,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.sent_at ELSE NULL END,
    'open'
  FROM workspace_leads WHERE id = NEW.lead_id
  ON CONFLICT (session_id, lead_id) DO UPDATE SET
    last_message_at = GREATEST(wa_conversations.last_message_at, EXCLUDED.last_message_at),
    last_inbound_at = CASE
      WHEN NEW.direction <> 'inbound' THEN wa_conversations.last_inbound_at
      WHEN wa_conversations.last_inbound_at IS NULL OR EXCLUDED.last_inbound_at > wa_conversations.last_inbound_at THEN EXCLUDED.last_inbound_at
      ELSE wa_conversations.last_inbound_at
    END,
    status = CASE WHEN NEW.direction = 'inbound' AND NOT NEW.historical THEN 'open' ELSE wa_conversations.status END,
    closed_at = CASE WHEN NEW.direction = 'inbound' AND NOT NEW.historical THEN NULL ELSE wa_conversations.closed_at END,
    updated_at = now();
  RETURN NEW;
END $$;

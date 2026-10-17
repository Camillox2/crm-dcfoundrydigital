ALTER TABLE wa_messages ADD COLUMN message_type varchar(16) NOT NULL DEFAULT 'text';
ALTER TABLE wa_messages ADD COLUMN delivery varchar(16) NOT NULL DEFAULT 'received' CHECK(delivery IN ('queued','sent','delivered','read','failed','received'));
ALTER TABLE wa_messages ADD COLUMN media_key varchar(200);
ALTER TABLE wa_messages ADD COLUMN mime_type varchar(150);
ALTER TABLE wa_messages ADD COLUMN file_name varchar(180);
ALTER TABLE wa_messages ADD COLUMN media_bytes integer;
ALTER TABLE wa_commands ADD COLUMN media_key varchar(200);
ALTER TABLE wa_commands ADD COLUMN mime_type varchar(150);
ALTER TABLE wa_commands ADD COLUMN file_name varchar(180);
ALTER TABLE wa_commands ADD COLUMN media_type varchar(16);
CREATE TABLE wa_media_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES workspace_leads(id),
 owner_id uuid NOT NULL REFERENCES users(id),storage_key varchar(200) NOT NULL UNIQUE,
 mime_type varchar(150) NOT NULL,file_name varchar(180) NOT NULL,media_type varchar(16) NOT NULL,bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 16777216),
 created_at timestamptz NOT NULL DEFAULT now()
);

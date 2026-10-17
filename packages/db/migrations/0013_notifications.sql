CREATE TABLE crm_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),event_key varchar(240) NOT NULL UNIQUE,
 kind varchar(32) NOT NULL,title varchar(180) NOT NULL,body varchar(500) NOT NULL,page varchar(32) NOT NULL,entity_id uuid,
 read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_notifications_user_idx ON crm_notifications(user_id,created_at DESC);
CREATE TABLE push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),endpoint text NOT NULL,endpoint_hash varchar(64) NOT NULL UNIQUE,
 p256dh varchar(180) NOT NULL,auth_ciphertext text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_push_deliveries(
 notification_id uuid NOT NULL REFERENCES crm_notifications(id) ON DELETE CASCADE,subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 status varchar(24) NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),accepted_at timestamptz,last_status integer,
 PRIMARY KEY(notification_id,subscription_id)
);
CREATE FUNCTION queue_notification_push() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO notification_push_deliveries(notification_id,subscription_id) SELECT NEW.id,id FROM push_subscriptions WHERE user_id=NEW.user_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_notification_push AFTER INSERT ON crm_notifications FOR EACH ROW EXECUTE FUNCTION queue_notification_push();
CREATE FUNCTION notify_new_agency_lead() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO crm_notifications(user_id,event_key,kind,title,body,page,entity_id) VALUES(NEW.owner_id,'lead:'||NEW.id,'new_lead','Novo lead recebido','Um contato novo está disponível no funil.','kanban',NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER agency_new_lead_notification AFTER INSERT ON workspace_leads FOR EACH ROW EXECUTE FUNCTION notify_new_agency_lead();
ALTER TABLE wa_sessions ADD COLUMN notification_revision integer NOT NULL DEFAULT 0;
CREATE FUNCTION notify_whatsapp_down() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='connected' AND NEW.status<>'connected' THEN
 NEW.notification_revision=OLD.notification_revision+1;
 INSERT INTO crm_notifications(user_id,event_key,kind,title,body,page,entity_id) VALUES(NEW.owner_id,'wa-down:'||NEW.id||':'||NEW.notification_revision,'whatsapp_down','WhatsApp desconectado','Verifique a conexão e o pareamento do atendimento.','whatsapp',NEW.id) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER agency_whatsapp_down_notification BEFORE UPDATE ON wa_sessions FOR EACH ROW EXECUTE FUNCTION notify_whatsapp_down();
CREATE FUNCTION notify_foundry_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT OLD.ai_paused AND NEW.ai_paused AND NEW.archived_at IS NULL AND NEW.handoff_reason IS NOT NULL THEN
 INSERT INTO crm_notifications(user_id,event_key,kind,title,body,page,entity_id) VALUES(NEW.owner_id,'handoff:'||NEW.id||':'||NEW.ai_control_revision,'human_handoff','Atendimento humano solicitado','Uma conversa precisa de uma pessoa da equipe.','whatsapp',NEW.id) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER agency_handoff_notification AFTER UPDATE ON workspace_leads FOR EACH ROW EXECUTE FUNCTION notify_foundry_handoff();

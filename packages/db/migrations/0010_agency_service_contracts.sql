CREATE TABLE company_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),name varchar(180) NOT NULL,document_ciphertext text NOT NULL,
 address text NOT NULL,email varchar(254) NOT NULL,phone varchar(24) NOT NULL,representative varchar(180) NOT NULL,
 version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,client varchar(180) NOT NULL,client_document_ciphertext text NOT NULL DEFAULT '',client_email varchar(254) NOT NULL DEFAULT '',client_address text NOT NULL DEFAULT '',client_representative varchar(180) NOT NULL DEFAULT '',
 service_type varchar(32) NOT NULL DEFAULT 'site_landing',value_cents bigint NOT NULL CHECK(value_cents>=0),upfront_cents bigint NOT NULL DEFAULT 0,installments integer NOT NULL DEFAULT 1,payment_day integer NOT NULL DEFAULT 10,billing varchar(16) NOT NULL,status varchar(24) NOT NULL DEFAULT 'draft',scope text NOT NULL,terms text NOT NULL,valid_until date,
 version integer NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_proposals_owner_idx ON agency_proposals(owner_id,updated_at DESC);
CREATE TABLE agency_proposals_versions (
 document_id uuid NOT NULL REFERENCES agency_proposals(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,client varchar(180) NOT NULL,client_document_ciphertext text NOT NULL DEFAULT '',client_email varchar(254) NOT NULL DEFAULT '',client_address text NOT NULL DEFAULT '',client_representative varchar(180) NOT NULL DEFAULT '',service_type varchar(32) NOT NULL DEFAULT 'site_landing',
 value_cents bigint NOT NULL,upfront_cents bigint NOT NULL DEFAULT 0,installments integer NOT NULL DEFAULT 1,payment_day integer NOT NULL DEFAULT 10,billing varchar(16) NOT NULL,status varchar(24) NOT NULL,scope text NOT NULL,terms text NOT NULL,valid_until date,
 actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version)
);
INSERT INTO agency_proposals(id,owner_id,lead_id,title,client,value_cents,billing,status,scope,terms,valid_until,version,archived_at,created_at,updated_at)
 SELECT id,owner_id,lead_id,data->>'title',data->>'client',(data->>'valueCents')::bigint,data->>'billing',data->>'status',COALESCE(data->>'scope',''),COALESCE(data->>'terms',''),NULLIF(data->>'validUntil','')::date,version,archived_at,created_at,updated_at FROM workspace_documents WHERE kind='contract';
INSERT INTO agency_proposals_versions(document_id,version,lead_id,title,client,value_cents,billing,status,scope,terms,valid_until,actor_id,saved_at)
 SELECT v.document_id,v.version,p.lead_id,v.data->>'title',v.data->>'client',(v.data->>'valueCents')::bigint,v.data->>'billing',v.data->>'status',COALESCE(v.data->>'scope',''),COALESCE(v.data->>'terms',''),NULLIF(v.data->>'validUntil','')::date,v.actor_id,v.saved_at FROM workspace_document_versions v JOIN agency_proposals p ON p.id=v.document_id;
CREATE TABLE service_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid NOT NULL REFERENCES workspace_leads(id),proposal_id uuid NOT NULL REFERENCES agency_proposals(id),proposal_version integer NOT NULL,
 title varchar(180) NOT NULL,service_type varchar(32) NOT NULL,document_ciphertext text NOT NULL,document_hash varchar(64) NOT NULL,client_document_ciphertext text NOT NULL,client_email varchar(254) NOT NULL,client_name varchar(180) NOT NULL,company_name varchar(180) NOT NULL,company_document_ciphertext text NOT NULL,provider_representative varchar(180) NOT NULL,
 token_hash varchar(64) NOT NULL UNIQUE,token_ciphertext text NOT NULL,token_expires_at timestamptz NOT NULL,status varchar(24) NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','client_signed','signed','cancelled')),
 value_cents bigint NOT NULL,billing varchar(16) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(proposal_id,proposal_version)
);
CREATE INDEX service_contracts_lead_idx ON service_contracts(lead_id,created_at DESC);
CREATE FUNCTION immutable_contract_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.document_hash,NEW.document_ciphertext,NEW.proposal_id,NEW.proposal_version,NEW.client_document_ciphertext,NEW.company_document_ciphertext,NEW.value_cents,NEW.billing) IS DISTINCT FROM ROW(OLD.document_hash,OLD.document_ciphertext,OLD.proposal_id,OLD.proposal_version,OLD.client_document_ciphertext,OLD.company_document_ciphertext,OLD.value_cents,OLD.billing) THEN RAISE EXCEPTION 'Contract content is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER service_contract_content_immutable BEFORE UPDATE ON service_contracts FOR EACH ROW EXECUTE FUNCTION immutable_contract_content();
CREATE TABLE contract_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES service_contracts(id),party varchar(16) NOT NULL CHECK(party IN ('client','provider')),
 signer_name varchar(180) NOT NULL,signer_document_hash varchar(64) NOT NULL,ip_address varchar(64) NOT NULL,user_agent varchar(500) NOT NULL,
 document_hash varchar(64) NOT NULL,evidence_hash varchar(64) NOT NULL,actor_id uuid REFERENCES users(id),signed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(contract_id,party)
);
CREATE FUNCTION immutable_contract_signature() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Signature evidence is append-only'; END $$;
CREATE TRIGGER contract_signature_immutable BEFORE UPDATE OR DELETE ON contract_signatures FOR EACH ROW EXECUTE FUNCTION immutable_contract_signature();
CREATE TABLE contract_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES service_contracts(id),owner_id uuid NOT NULL REFERENCES users(id),
 channel varchar(16) NOT NULL CHECK(channel IN ('email','whatsapp')),recipient varchar(254) NOT NULL,status varchar(24) NOT NULL DEFAULT 'queued',
 request_id uuid NOT NULL UNIQUE,wa_message_id uuid REFERENCES wa_messages(id),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);

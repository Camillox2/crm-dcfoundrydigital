CREATE TABLE client_portal_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES workspace_leads(id),owner_id uuid NOT NULL REFERENCES users(id),
 token_hash varchar(64) NOT NULL UNIQUE,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES workspace_leads(id),owner_id uuid NOT NULL REFERENCES users(id),
 title varchar(180) NOT NULL,kind varchar(24) NOT NULL CHECK(kind IN('adjustment','support','maintenance')),description text NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','waiting_client','resolved','cancelled')),
 priority varchar(16) NOT NULL DEFAULT 'normal' CHECK(priority IN('normal','high')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_requests_lead_idx ON service_requests(lead_id,created_at DESC);
CREATE TABLE service_request_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES service_requests(id),
 actor_type varchar(16) NOT NULL CHECK(actor_type IN('client','user')),actor_id uuid REFERENCES users(id),
 message text NOT NULL,status varchar(24) NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agency_proposals_versions ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE agency_proposals_versions ADD COLUMN actor_type varchar(16) NOT NULL DEFAULT 'user';
CREATE TABLE proposal_acceptances(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL REFERENCES agency_proposals(id),proposal_version integer NOT NULL,
 portal_id uuid NOT NULL REFERENCES client_portal_links(id),name varchar(180) NOT NULL,ip_address varchar(64) NOT NULL,user_agent varchar(500) NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),UNIQUE(proposal_id,proposal_version)
);

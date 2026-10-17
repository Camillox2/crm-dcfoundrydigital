CREATE TABLE calendar_settings(
 owner_id uuid PRIMARY KEY REFERENCES users(id),enabled boolean NOT NULL DEFAULT false,weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
 start_hour integer NOT NULL DEFAULT 9 CHECK(start_hour BETWEEN 0 AND 22),end_hour integer NOT NULL DEFAULT 18 CHECK(end_hour BETWEEN 1 AND 23),
 duration_minutes integer NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 15 AND 120),version integer NOT NULL DEFAULT 1,
 CHECK(end_hour>start_hour)
);
CREATE TABLE calendar_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,kind varchar(24) NOT NULL CHECK(kind IN('meeting','followup','event')),description text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,meeting_url text NOT NULL DEFAULT '',status varchar(16) NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','completed','cancelled')),
 source varchar(16) NOT NULL DEFAULT 'user',source_key varchar(180) UNIQUE,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at)
);
CREATE INDEX calendar_events_owner_date_idx ON calendar_events(owner_id,starts_at);
CREATE TABLE calendar_event_versions(
 event_id uuid NOT NULL REFERENCES calendar_events(id),version integer NOT NULL,title varchar(180) NOT NULL,kind varchar(24) NOT NULL,description text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,meeting_url text NOT NULL,status varchar(16) NOT NULL,lead_id uuid REFERENCES workspace_leads(id),
 actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(event_id,version)
);

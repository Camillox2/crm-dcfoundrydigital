-- Replace legacy JSON document storage with native, service-specific columns.
CREATE TABLE agency_blog_posts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
slug varchar(180) NOT NULL,
excerpt text NOT NULL,
content text NOT NULL,
cover_url text NOT NULL,
cover_alt varchar(200) NOT NULL,
author varchar(180) NOT NULL,
category varchar(180) NOT NULL,
tags text[] NOT NULL,
seo_title varchar(70) NOT NULL,
seo_description varchar(180) NOT NULL,
status varchar(24) NOT NULL,
scheduled_at timestamptz,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_blog_posts_owner_idx ON agency_blog_posts(owner_id,updated_at DESC);
CREATE TABLE agency_blog_posts_versions(document_id uuid NOT NULL REFERENCES agency_blog_posts(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
slug varchar(180) NOT NULL,
excerpt text NOT NULL,
content text NOT NULL,
cover_url text NOT NULL,
cover_alt varchar(200) NOT NULL,
author varchar(180) NOT NULL,
category varchar(180) NOT NULL,
tags text[] NOT NULL,
seo_title varchar(70) NOT NULL,
seo_description varchar(180) NOT NULL,
status varchar(24) NOT NULL,
scheduled_at timestamptz,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_blog_posts(id,owner_id,lead_id,title,slug,excerpt,content,cover_url,cover_alt,author,category,tags,seo_title,seo_description,status,scheduled_at,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),COALESCE(data->>'slug',''),COALESCE(data->>'excerpt',''),COALESCE(data->>'content',''),COALESCE(data->>'coverUrl',''),COALESCE(data->>'coverAlt',''),COALESCE(data->>'author',''),COALESCE(data->>'category',''),ARRAY(SELECT jsonb_array_elements_text(COALESCE(data->'tags','[]'))),COALESCE(data->>'seoTitle',''),COALESCE(data->>'seoDescription',''),COALESCE(data->>'status',''),NULLIF(data->>'scheduledAt','')::timestamptz,version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='blog';
INSERT INTO agency_blog_posts_versions(document_id,version,lead_id,title,slug,excerpt,content,cover_url,cover_alt,author,category,tags,seo_title,seo_description,status,scheduled_at,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),COALESCE(v.data->>'slug',''),COALESCE(v.data->>'excerpt',''),COALESCE(v.data->>'content',''),COALESCE(v.data->>'coverUrl',''),COALESCE(v.data->>'coverAlt',''),COALESCE(v.data->>'author',''),COALESCE(v.data->>'category',''),ARRAY(SELECT jsonb_array_elements_text(COALESCE(v.data->'tags','[]'))),COALESCE(v.data->>'seoTitle',''),COALESCE(v.data->>'seoDescription',''),COALESCE(v.data->>'status',''),NULLIF(v.data->>'scheduledAt','')::timestamptz,v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='blog';
DO $$ BEGIN IF (SELECT count(*) FROM agency_blog_posts)<>(SELECT count(*) FROM workspace_documents WHERE kind='blog') OR (SELECT count(*) FROM agency_blog_posts_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='blog') THEN RAISE EXCEPTION 'Typed blog migration count mismatch'; END IF; END $$;
CREATE TABLE agency_charges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
client varchar(180) NOT NULL,
amount_cents bigint NOT NULL,
due_date date,
status varchar(24) NOT NULL,
paid_at date,
method varchar(24) NOT NULL,
notes text NOT NULL,
receipt text NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_charges_owner_idx ON agency_charges(owner_id,updated_at DESC);
CREATE TABLE agency_charges_versions(document_id uuid NOT NULL REFERENCES agency_charges(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
client varchar(180) NOT NULL,
amount_cents bigint NOT NULL,
due_date date,
status varchar(24) NOT NULL,
paid_at date,
method varchar(24) NOT NULL,
notes text NOT NULL,
receipt text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_charges(id,owner_id,lead_id,title,client,amount_cents,due_date,status,paid_at,method,notes,receipt,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),COALESCE(data->>'client',''),COALESCE((data->>'amountCents')::bigint,0),NULLIF(data->>'dueDate','')::date,COALESCE(data->>'status',''),NULLIF(data->>'paidAt','')::date,COALESCE(data->>'method',''),COALESCE(data->>'notes',''),COALESCE(data->>'receipt',''),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='invoice';
INSERT INTO agency_charges_versions(document_id,version,lead_id,title,client,amount_cents,due_date,status,paid_at,method,notes,receipt,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),COALESCE(v.data->>'client',''),COALESCE((v.data->>'amountCents')::bigint,0),NULLIF(v.data->>'dueDate','')::date,COALESCE(v.data->>'status',''),NULLIF(v.data->>'paidAt','')::date,COALESCE(v.data->>'method',''),COALESCE(v.data->>'notes',''),COALESCE(v.data->>'receipt',''),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='invoice';
DO $$ BEGIN IF (SELECT count(*) FROM agency_charges)<>(SELECT count(*) FROM workspace_documents WHERE kind='invoice') OR (SELECT count(*) FROM agency_charges_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='invoice') THEN RAISE EXCEPTION 'Typed invoice migration count mismatch'; END IF; END $$;
CREATE TABLE agency_tasks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
due_date date,
status varchar(24) NOT NULL,
priority varchar(24) NOT NULL,
notes text NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_tasks_owner_idx ON agency_tasks(owner_id,updated_at DESC);
CREATE TABLE agency_tasks_versions(document_id uuid NOT NULL REFERENCES agency_tasks(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
due_date date,
status varchar(24) NOT NULL,
priority varchar(24) NOT NULL,
notes text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_tasks(id,owner_id,lead_id,title,due_date,status,priority,notes,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),NULLIF(data->>'dueDate','')::date,COALESCE(data->>'status',''),COALESCE(data->>'priority',''),COALESCE(data->>'notes',''),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='task';
INSERT INTO agency_tasks_versions(document_id,version,lead_id,title,due_date,status,priority,notes,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),NULLIF(v.data->>'dueDate','')::date,COALESCE(v.data->>'status',''),COALESCE(v.data->>'priority',''),COALESCE(v.data->>'notes',''),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='task';
DO $$ BEGIN IF (SELECT count(*) FROM agency_tasks)<>(SELECT count(*) FROM workspace_documents WHERE kind='task') OR (SELECT count(*) FROM agency_tasks_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='task') THEN RAISE EXCEPTION 'Typed task migration count mismatch'; END IF; END $$;
CREATE TABLE agency_message_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
content text NOT NULL,
category varchar(180) NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_message_templates_owner_idx ON agency_message_templates(owner_id,updated_at DESC);
CREATE TABLE agency_message_templates_versions(document_id uuid NOT NULL REFERENCES agency_message_templates(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
content text NOT NULL,
category varchar(180) NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_message_templates(id,owner_id,lead_id,title,content,category,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),COALESCE(data->>'content',''),COALESCE(data->>'category',''),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='template';
INSERT INTO agency_message_templates_versions(document_id,version,lead_id,title,content,category,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),COALESCE(v.data->>'content',''),COALESCE(v.data->>'category',''),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='template';
DO $$ BEGIN IF (SELECT count(*) FROM agency_message_templates)<>(SELECT count(*) FROM workspace_documents WHERE kind='template') OR (SELECT count(*) FROM agency_message_templates_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='template') THEN RAISE EXCEPTION 'Typed template migration count mismatch'; END IF; END $$;
CREATE TABLE agency_ads_metrics(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
campaign_id varchar(180) NOT NULL,
account varchar(180) NOT NULL,
metric_date date,
cost_cents bigint NOT NULL,
impressions bigint NOT NULL,
clicks bigint NOT NULL,
conversions numeric(20,4) NOT NULL,
currency varchar(3) NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_ads_metrics_owner_idx ON agency_ads_metrics(owner_id,updated_at DESC);
CREATE TABLE agency_ads_metrics_versions(document_id uuid NOT NULL REFERENCES agency_ads_metrics(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
campaign_id varchar(180) NOT NULL,
account varchar(180) NOT NULL,
metric_date date,
cost_cents bigint NOT NULL,
impressions bigint NOT NULL,
clicks bigint NOT NULL,
conversions numeric(20,4) NOT NULL,
currency varchar(3) NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_ads_metrics(id,owner_id,lead_id,title,campaign_id,account,metric_date,cost_cents,impressions,clicks,conversions,currency,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),COALESCE(data->>'campaignId',''),COALESCE(data->>'account',''),NULLIF(data->>'date','')::date,COALESCE((data->>'costCents')::bigint,0),COALESCE((data->>'impressions')::bigint,0),COALESCE((data->>'clicks')::bigint,0),COALESCE((data->>'conversions')::numeric(20,4),0),COALESCE(data->>'currency','BRL'),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='campaign';
INSERT INTO agency_ads_metrics_versions(document_id,version,lead_id,title,campaign_id,account,metric_date,cost_cents,impressions,clicks,conversions,currency,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),COALESCE(v.data->>'campaignId',''),COALESCE(v.data->>'account',''),NULLIF(v.data->>'date','')::date,COALESCE((v.data->>'costCents')::bigint,0),COALESCE((v.data->>'impressions')::bigint,0),COALESCE((v.data->>'clicks')::bigint,0),COALESCE((v.data->>'conversions')::numeric(20,4),0),COALESCE(v.data->>'currency','BRL'),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='campaign';
DO $$ BEGIN IF (SELECT count(*) FROM agency_ads_metrics)<>(SELECT count(*) FROM workspace_documents WHERE kind='campaign') OR (SELECT count(*) FROM agency_ads_metrics_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='campaign') THEN RAISE EXCEPTION 'Typed campaign migration count mismatch'; END IF; END $$;
CREATE TABLE agency_projects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,
client varchar(180) NOT NULL,
status varchar(24) NOT NULL,
priority varchar(24) NOT NULL,
start_date date,
due_date date,
progress integer NOT NULL,
budget_cents bigint NOT NULL,
stack text NOT NULL,
url text NOT NULL,
scope text NOT NULL,
notes text NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_projects_owner_idx ON agency_projects(owner_id,updated_at DESC);
CREATE TABLE agency_projects_versions(document_id uuid NOT NULL REFERENCES agency_projects(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,
client varchar(180) NOT NULL,
status varchar(24) NOT NULL,
priority varchar(24) NOT NULL,
start_date date,
due_date date,
progress integer NOT NULL,
budget_cents bigint NOT NULL,
stack text NOT NULL,
url text NOT NULL,
scope text NOT NULL,
notes text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_projects(id,owner_id,lead_id,title,client,status,priority,start_date,due_date,progress,budget_cents,stack,url,scope,notes,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),COALESCE(data->>'client',''),COALESCE(data->>'status',''),COALESCE(data->>'priority',''),NULLIF(data->>'startDate','')::date,NULLIF(data->>'dueDate','')::date,COALESCE((data->>'progress')::integer,0),COALESCE((data->>'budgetCents')::bigint,0),COALESCE(data->>'stack',''),COALESCE(data->>'url',''),COALESCE(data->>'scope',''),COALESCE(data->>'notes',''),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='project';
INSERT INTO agency_projects_versions(document_id,version,lead_id,title,client,status,priority,start_date,due_date,progress,budget_cents,stack,url,scope,notes,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),COALESCE(v.data->>'client',''),COALESCE(v.data->>'status',''),COALESCE(v.data->>'priority',''),NULLIF(v.data->>'startDate','')::date,NULLIF(v.data->>'dueDate','')::date,COALESCE((v.data->>'progress')::integer,0),COALESCE((v.data->>'budgetCents')::bigint,0),COALESCE(v.data->>'stack',''),COALESCE(v.data->>'url',''),COALESCE(v.data->>'scope',''),COALESCE(v.data->>'notes',''),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='project';
DO $$ BEGIN IF (SELECT count(*) FROM agency_projects)<>(SELECT count(*) FROM workspace_documents WHERE kind='project') OR (SELECT count(*) FROM agency_projects_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='project') THEN RAISE EXCEPTION 'Typed project migration count mismatch'; END IF; END $$;
CREATE TABLE agency_conversations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid REFERENCES workspace_leads(id),
 title varchar(180) NOT NULL,version integer NOT NULL DEFAULT 1,archived_at timestamptz,published_at timestamptz,sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_conversations_owner_idx ON agency_conversations(owner_id,updated_at DESC);
CREATE TABLE agency_conversations_versions(document_id uuid NOT NULL REFERENCES agency_conversations(id),version integer NOT NULL,lead_id uuid REFERENCES workspace_leads(id),title varchar(180) NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,version));
INSERT INTO agency_conversations(id,owner_id,lead_id,title,version,archived_at,published_at,sync_status,created_at,updated_at) SELECT id,owner_id,lead_id,COALESCE(data->>'title',''),version,archived_at,published_at,sync_status,created_at,updated_at FROM workspace_documents WHERE kind='conversation';
INSERT INTO agency_conversations_versions(document_id,version,lead_id,title,actor_id,saved_at) SELECT v.document_id,v.version,d.lead_id,COALESCE(v.data->>'title',''),v.actor_id,v.saved_at FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='conversation';
DO $$ BEGIN IF (SELECT count(*) FROM agency_conversations)<>(SELECT count(*) FROM workspace_documents WHERE kind='conversation') OR (SELECT count(*) FROM agency_conversations_versions)<>(SELECT count(*) FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id WHERE d.kind='conversation') THEN RAISE EXCEPTION 'Typed conversation migration count mismatch'; END IF; END $$;
CREATE UNIQUE INDEX agency_blog_slug_uq ON agency_blog_posts(slug);
CREATE UNIQUE INDEX agency_ads_metric_day_uq ON agency_ads_metrics(campaign_id,account,metric_date) WHERE archived_at IS NULL;
CREATE TABLE agency_conversation_messages(document_id uuid NOT NULL REFERENCES agency_conversations(id),position integer NOT NULL,role varchar(16) NOT NULL,content text NOT NULL,PRIMARY KEY(document_id,position));
CREATE TABLE agency_conversation_version_messages(document_id uuid NOT NULL,version integer NOT NULL,position integer NOT NULL,role varchar(16) NOT NULL,content text NOT NULL,PRIMARY KEY(document_id,version,position),FOREIGN KEY(document_id,version) REFERENCES agency_conversations_versions(document_id,version));
INSERT INTO agency_conversation_messages(document_id,position,role,content) SELECT d.id,(m.ordinality-1)::integer,m.value->>'role',m.value->>'content' FROM workspace_documents d CROSS JOIN LATERAL jsonb_array_elements(d.data->'messages') WITH ORDINALITY m WHERE d.kind='conversation';
INSERT INTO agency_conversation_version_messages(document_id,version,position,role,content) SELECT v.document_id,v.version,(m.ordinality-1)::integer,m.value->>'role',m.value->>'content' FROM workspace_document_versions v JOIN workspace_documents d ON d.id=v.document_id CROSS JOIN LATERAL jsonb_array_elements(v.data->'messages') WITH ORDINALITY m WHERE d.kind='conversation';
ALTER TABLE workspace_blog_outbox DROP CONSTRAINT workspace_blog_outbox_document_id_fkey;
ALTER TABLE workspace_blog_outbox ADD CONSTRAINT workspace_blog_outbox_document_id_fkey FOREIGN KEY(document_id) REFERENCES agency_blog_posts(id) ON DELETE CASCADE;
DROP TABLE workspace_document_versions;
DROP TABLE workspace_documents;
-- Compatibility read views construct DTOs; they store no JSON documents and are not writable.
CREATE VIEW workspace_documents AS SELECT t.id,'blog'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'slug',t.slug,'excerpt',t.excerpt,'content',t.content,'coverUrl',t.cover_url,'coverAlt',t.cover_alt,'author',t.author,'category',t.category,'tags',t.tags,'seoTitle',t.seo_title,'seoDescription',t.seo_description,'status',t.status,'scheduledAt',COALESCE(to_char(t.scheduled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'')) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_blog_posts t
UNION ALL
SELECT t.id,'invoice'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'client',t.client,'amountCents',t.amount_cents,'dueDate',COALESCE(to_char(t.due_date,'YYYY-MM-DD'),''),'status',t.status,'paidAt',COALESCE(to_char(t.paid_at,'YYYY-MM-DD'),''),'method',t.method,'notes',t.notes,'receipt',t.receipt) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_charges t
UNION ALL
SELECT t.id,'task'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'dueDate',COALESCE(to_char(t.due_date,'YYYY-MM-DD'),''),'status',t.status,'priority',t.priority,'notes',t.notes) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_tasks t
UNION ALL
SELECT t.id,'template'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'content',t.content,'category',t.category) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_message_templates t
UNION ALL
SELECT t.id,'campaign'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'campaignId',t.campaign_id,'account',t.account,'date',COALESCE(to_char(t.metric_date,'YYYY-MM-DD'),''),'costCents',t.cost_cents,'impressions',t.impressions,'clicks',t.clicks,'conversions',t.conversions,'currency',t.currency) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_ads_metrics t
UNION ALL
SELECT t.id,'project'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'client',t.client,'status',t.status,'priority',t.priority,'startDate',COALESCE(to_char(t.start_date,'YYYY-MM-DD'),''),'dueDate',COALESCE(to_char(t.due_date,'YYYY-MM-DD'),''),'progress',t.progress,'budgetCents',t.budget_cents,'stack',t.stack,'url',t.url,'scope',t.scope,'notes',t.notes) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_projects t
UNION ALL
SELECT t.id,'conversation'::varchar(24) AS kind,t.owner_id,t.lead_id,jsonb_build_object('title',t.title,'messages',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',cm.role,'content',cm.content) ORDER BY cm.position) FROM agency_conversation_messages cm WHERE cm.document_id=t.id),'[]'::jsonb)) AS data,t.version,t.archived_at,t.published_at,t.sync_status,t.created_at,t.updated_at FROM agency_conversations t;
CREATE VIEW workspace_document_versions AS SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'slug',t.slug,'excerpt',t.excerpt,'content',t.content,'coverUrl',t.cover_url,'coverAlt',t.cover_alt,'author',t.author,'category',t.category,'tags',t.tags,'seoTitle',t.seo_title,'seoDescription',t.seo_description,'status',t.status,'scheduledAt',COALESCE(t.scheduled_at::text,'')) AS data,t.actor_id,t.saved_at FROM agency_blog_posts_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'client',t.client,'amountCents',t.amount_cents,'dueDate',COALESCE(t.due_date::text,''),'status',t.status,'paidAt',COALESCE(t.paid_at::text,''),'method',t.method,'notes',t.notes,'receipt',t.receipt) AS data,t.actor_id,t.saved_at FROM agency_charges_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'dueDate',COALESCE(t.due_date::text,''),'status',t.status,'priority',t.priority,'notes',t.notes) AS data,t.actor_id,t.saved_at FROM agency_tasks_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'content',t.content,'category',t.category) AS data,t.actor_id,t.saved_at FROM agency_message_templates_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'campaignId',t.campaign_id,'account',t.account,'date',COALESCE(t.metric_date::text,''),'costCents',t.cost_cents,'impressions',t.impressions,'clicks',t.clicks,'conversions',t.conversions,'currency',t.currency) AS data,t.actor_id,t.saved_at FROM agency_ads_metrics_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title,'client',t.client,'status',t.status,'priority',t.priority,'startDate',COALESCE(t.start_date::text,''),'dueDate',COALESCE(t.due_date::text,''),'progress',t.progress,'budgetCents',t.budget_cents,'stack',t.stack,'url',t.url,'scope',t.scope,'notes',t.notes) AS data,t.actor_id,t.saved_at FROM agency_projects_versions t
UNION ALL
SELECT t.document_id,t.version,jsonb_build_object('title',t.title) AS data,t.actor_id,t.saved_at FROM agency_conversations_versions t;

ALTER TABLE workspace_leads ALTER COLUMN gclid TYPE varchar(512);
ALTER TABLE workspace_leads ADD COLUMN utm_source varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN utm_medium varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN utm_campaign varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN utm_term varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN utm_content varchar(200) NOT NULL DEFAULT '';
ALTER TABLE workspace_leads ADD COLUMN ad_consent varchar(16) NOT NULL DEFAULT 'unknown' CHECK(ad_consent IN('unknown','granted','denied'));
ALTER TABLE workspace_leads ADD COLUMN ad_consent_at timestamptz;
ALTER TABLE workspace_leads ADD COLUMN attribution_captured_at timestamptz;
CREATE TABLE lead_import_batches(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES users(id),file_hash varchar(64) NOT NULL,imported integer NOT NULL,duplicates integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agency_offline_conversions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),lead_id uuid NOT NULL REFERENCES workspace_leads(id),evidence_type varchar(24) NOT NULL CHECK(evidence_type IN('proposal_accepted','payment_received')),evidence_id uuid NOT NULL,conversion_action varchar(64) NOT NULL,transaction_id varchar(180) NOT NULL UNIQUE,gclid_ciphertext text NOT NULL,value_cents bigint NOT NULL,event_at timestamptz NOT NULL,status varchar(32) NOT NULL DEFAULT 'queued',validate_only boolean NOT NULL DEFAULT true,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),request_id varchar(180),warning_count integer NOT NULL DEFAULT 0,error_count integer NOT NULL DEFAULT 0,last_error varchar(180),diagnostic_attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(conversion_action,evidence_type,evidence_id));
ALTER TABLE workspace_leads ADD COLUMN attribution_version integer NOT NULL DEFAULT 1;
ALTER TABLE workspace_leads ADD COLUMN email varchar(254) NOT NULL DEFAULT '';

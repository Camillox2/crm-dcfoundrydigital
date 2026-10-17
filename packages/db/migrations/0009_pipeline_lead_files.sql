ALTER TABLE pipelines ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE pipeline_stages ADD COLUMN slug varchar(32);
UPDATE pipeline_stages SET slug=CASE position WHEN 1 THEN 'novo' WHEN 2 THEN 'qualificado_ia' WHEN 3 THEN 'orcamento' WHEN 4 THEN 'contrato_ativo' ELSE 'etapa-'||position END;
ALTER TABLE pipeline_stages ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX pipeline_stages_slug_uq ON pipeline_stages(pipeline_id,slug);
INSERT INTO pipelines(name,slug,is_default) VALUES('Comercial DC Foundry','comercial',true) ON CONFLICT(slug) DO NOTHING;
UPDATE pipeline_stages SET position=position+10000;
UPDATE pipeline_stages SET position=CASE slug WHEN 'novo' THEN 1 WHEN 'qualificado_ia' THEN 2 WHEN 'reuniao' THEN 3 WHEN 'orcamento' THEN 4 WHEN 'negociacao' THEN 5 WHEN 'contrato_ativo' THEN 6 WHEN 'perdido' THEN 7 ELSE position END,
 name=CASE slug WHEN 'novo' THEN 'Novo' WHEN 'qualificado_ia' THEN 'Qualificado' WHEN 'orcamento' THEN 'Proposta' WHEN 'contrato_ativo' THEN 'Ganho' ELSE name END;
INSERT INTO pipeline_stages(pipeline_id,slug,name,position,sla_minutes,color_hex,is_won,is_lost)
 SELECT p.id,v.slug,v.name,v.position,v.sla,v.color,v.won,v.lost FROM pipelines p CROSS JOIN (VALUES
 ('novo','Novo',1,30,'#246ba5',false,false),('qualificado_ia','Qualificado',2,120,'#198980',false,false),('reuniao','Reunião',3,1440,'#6076bc',false,false),('orcamento','Proposta',4,1440,'#bb7c38',false,false),('negociacao','Negociação',5,1440,'#8763b6',false,false),('contrato_ativo','Ganho',6,1440,'#21865c',true,false),('perdido','Perdido',7,1440,'#ac5963',false,true)
 ) AS v(slug,name,position,sla,color,won,lost) WHERE p.is_default=true ON CONFLICT(pipeline_id,slug) DO NOTHING;
ALTER TABLE workspace_leads DROP CONSTRAINT workspace_leads_stage_check;
ALTER TABLE workspace_leads ADD COLUMN pipeline_id uuid REFERENCES pipelines(id);
UPDATE workspace_leads SET pipeline_id=(SELECT id FROM pipelines WHERE is_default=true ORDER BY created_at LIMIT 1);
ALTER TABLE workspace_leads ALTER COLUMN pipeline_id SET NOT NULL;
ALTER TABLE workspace_leads ADD CONSTRAINT workspace_lead_stage_fk FOREIGN KEY(pipeline_id,stage) REFERENCES pipeline_stages(pipeline_id,slug);
CREATE FUNCTION fill_workspace_pipeline() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.pipeline_id IS NULL THEN NEW.pipeline_id=(SELECT id FROM pipelines WHERE is_default=true ORDER BY created_at LIMIT 1); END IF; RETURN NEW;
END $$;
CREATE TRIGGER workspace_pipeline_default BEFORE INSERT ON workspace_leads FOR EACH ROW EXECUTE FUNCTION fill_workspace_pipeline();
CREATE TABLE pipeline_stage_revisions (
 pipeline_id uuid NOT NULL REFERENCES pipelines(id),version integer NOT NULL,slug varchar(32) NOT NULL,name varchar(120) NOT NULL,position integer NOT NULL,sla_minutes integer NOT NULL,color_hex varchar(16) NOT NULL,is_won boolean NOT NULL,is_lost boolean NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(pipeline_id,version,slug)
);
CREATE TABLE lead_tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(40) NOT NULL UNIQUE,color varchar(7) NOT NULL DEFAULT '#246ba5');
CREATE TABLE lead_tag_links (lead_id uuid NOT NULL REFERENCES workspace_leads(id),tag_id uuid NOT NULL REFERENCES lead_tags(id),PRIMARY KEY(lead_id,tag_id));
CREATE TABLE lead_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES workspace_leads(id),owner_id uuid NOT NULL REFERENCES users(id),file_name varchar(180) NOT NULL,mime_type varchar(150) NOT NULL,storage_key varchar(200) NOT NULL UNIQUE,bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 16777216),sha256 varchar(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_attachments_lead_idx ON lead_attachments(lead_id,created_at DESC);

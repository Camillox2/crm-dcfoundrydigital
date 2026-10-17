CREATE TABLE IF NOT EXISTS ai_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 provider varchar(24) NOT NULL DEFAULT 'gemini',
 feature varchar(40) NOT NULL DEFAULT 'assistant_chat',
 model varchar(120) NOT NULL,
 outcome varchar(12) NOT NULL CHECK (outcome IN ('success','quota','error')),
 http_status integer,
 latency_ms integer NOT NULL CHECK (latency_ms >= 0),
 fallback_position integer NOT NULL CHECK (fallback_position >= 1),
 prompt_tokens integer, output_tokens integer, total_tokens integer,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL
);
-- Idempotent: the table may already exist (feat/ai-usage applied as 0004_ai_usage.sql in production,
-- or a partial table from an earlier branch). Add any missing column before creating indexes.
ALTER TABLE ai_usage_events
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS provider varchar(24) NOT NULL DEFAULT 'gemini',
 ADD COLUMN IF NOT EXISTS feature varchar(40) NOT NULL DEFAULT 'assistant_chat',
 ADD COLUMN IF NOT EXISTS model varchar(120) NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS outcome varchar(12) NOT NULL DEFAULT 'error' CHECK (outcome IN ('success','quota','error')),
 ADD COLUMN IF NOT EXISTS http_status integer,
 ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
 ADD COLUMN IF NOT EXISTS fallback_position integer NOT NULL DEFAULT 1 CHECK (fallback_position >= 1),
 ADD COLUMN IF NOT EXISTS prompt_tokens integer,
 ADD COLUMN IF NOT EXISTS output_tokens integer,
 ADD COLUMN IF NOT EXISTS total_tokens integer,
 ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_model_idx ON ai_usage_events(model, created_at DESC);

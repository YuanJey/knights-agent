CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['research:read', 'research:write'],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE research_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '全球',
  horizon TEXT NOT NULL DEFAULT '1-3个月',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  risk_score SMALLINT NOT NULL DEFAULT 0
    CHECK (risk_score BETWEEN 0 AND 100),
  risk_delta SMALLINT NOT NULL DEFAULT 0
    CHECK (risk_delta BETWEEN -100 AND 100),
  market_pricing TEXT NOT NULL DEFAULT '观察中',
  impact_scope TEXT NOT NULL DEFAULT '待评估',
  confidence SMALLINT NOT NULL DEFAULT 0
    CHECK (confidence BETWEEN 0 AND 100),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  canonical_url TEXT,
  publisher TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'zh-CN',
  credibility_score SMALLINT NOT NULL DEFAULT 50
    CHECK (credibility_score BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, content_hash)
);

CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  phase TEXT NOT NULL
    CHECK (phase IN ('occurred', 'evolving', 'watch')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  signal TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  source_label TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  fingerprint TEXT,
  observed_at TIMESTAMPTZ,
  expected_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (phase IN ('occurred', 'evolving') AND observed_at IS NOT NULL)
    OR (phase = 'watch' AND expected_at IS NOT NULL)
  )
);

CREATE TABLE event_sources (
  event_id UUID NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5, 4) NOT NULL DEFAULT 1
    CHECK (relevance_score BETWEEN 0 AND 1),
  PRIMARY KEY (event_id, source_id)
);

CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('initial', 'refresh', 'question', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  confidence SMALLINT CHECK (confidence BETWEEN 0 AND 100),
  counter_signal TEXT,
  raw_output JSONB,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transmission_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('red', 'amber', 'blue', 'green')),
  rationale TEXT NOT NULL DEFAULT '',
  UNIQUE (analysis_id, position)
);

CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  probability SMALLINT NOT NULL CHECK (probability BETWEEN 0 AND 100),
  tone TEXT NOT NULL CHECK (tone IN ('base', 'risk', 'ease')),
  narrative TEXT NOT NULL,
  trigger_condition TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE watch_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL,
  query_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'invalidated', 'paused')),
  last_value TEXT,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('initial', 'refresh', 'question', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'retrying', 'failed')),
  question TEXT,
  stream_message_id TEXT,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('api_key', 'system', 'worker')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  ip_address INET,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_workspace_active
  ON api_keys (workspace_id, key_prefix)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_topics_workspace_updated
  ON research_topics (workspace_id, updated_at DESC);
CREATE INDEX idx_events_topic_order
  ON timeline_events (workspace_id, topic_id, sort_order, observed_at, expected_at);
CREATE INDEX idx_events_tags ON timeline_events USING GIN (tags);
CREATE UNIQUE INDEX idx_events_fingerprint
  ON timeline_events (workspace_id, topic_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_sources_published
  ON source_documents (workspace_id, published_at DESC);
CREATE INDEX idx_analysis_topic_completed
  ON analysis_runs (workspace_id, topic_id, completed_at DESC)
  WHERE status = 'completed';
CREATE INDEX idx_indicators_due
  ON watch_indicators (status, next_check_at)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_status_queued
  ON analysis_jobs (status, queued_at)
  WHERE status IN ('queued', 'retrying');
CREATE INDEX idx_audit_workspace_created
  ON audit_logs (workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_topics_updated_at
  BEFORE UPDATE ON research_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON timeline_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_indicators_updated_at
  BEFORE UPDATE ON watch_indicators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Smoke login audit (no passwords stored).
-- Applied automatically by the simulator on startup when DATABASE_URL is set.
-- Safe to run manually against RDS / Postgres as well.

CREATE TABLE IF NOT EXISTS smoke_login_audit (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  company_name TEXT,
  workspace_id TEXT,
  login_surface TEXT,
  mode TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  ip TEXT,
  user_agent TEXT,
  latency_ms INTEGER,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS smoke_login_audit_logged_in_at_idx
  ON smoke_login_audit (logged_in_at DESC);

CREATE INDEX IF NOT EXISTS smoke_login_audit_email_idx
  ON smoke_login_audit (email);

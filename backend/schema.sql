PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS ability_profiles (
  profile_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current', 'history')),
  confidence REAL NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_child_status ON ability_profiles(child_id, status, created_at);

CREATE TABLE IF NOT EXISTS ai_inferences (
  inference_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES ability_profiles(profile_id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  assessment_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  tool_code TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessment_child ON assessments(child_id, created_at);

CREATE TABLE IF NOT EXISTS intervention_logs (
  record_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  method_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intervention_child ON intervention_logs(child_id, created_at);

CREATE TABLE IF NOT EXISTS care_records (
  record_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('intake','goal','plan','reevaluation','closure','followup','confirmation')),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_child_kind ON care_records(child_id, kind, created_at);

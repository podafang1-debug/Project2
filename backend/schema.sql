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

CREATE TABLE IF NOT EXISTS import_batches (
  batch_id TEXT PRIMARY KEY,
  created_by_role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','processing','review','imported','failed')),
  total_documents INTEGER NOT NULL DEFAULT 0,
  processed_documents INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_documents (
  document_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(batch_id),
  original_name TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  encrypted_path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_document_batch ON source_documents(batch_id, status);
CREATE TABLE IF NOT EXISTS document_pages (
  page_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(document_id),
  page_number INTEGER NOT NULL,
  page_type TEXT NOT NULL,
  orientation INTEGER NOT NULL DEFAULT 0,
  ocr_confidence REAL NOT NULL DEFAULT 0,
  encrypted_ocr TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, page_number)
);
CREATE TABLE IF NOT EXISTS extracted_fields (
  field_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(document_id),
  page_number INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  extracted_value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sensitivity TEXT NOT NULL DEFAULT 'health',
  review_status TEXT NOT NULL CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_value TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extracted_field_document_review ON extracted_fields(document_id, review_status);
CREATE TABLE IF NOT EXISTS import_reviews (
  review_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(batch_id),
  document_id TEXT NOT NULL REFERENCES source_documents(document_id),
  reviewer_role TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_review_batch ON import_reviews(batch_id, created_at);
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 档案画像 Agent：自动结果先以 draft 保存，专业审核后才可成为 current/effective。
CREATE TABLE IF NOT EXISTS profile_agent_runs (
  run_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(batch_id),
  child_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','rejected','failed')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  profile_payload TEXT NOT NULL,
  solution_payload TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_run_child_status ON profile_agent_runs(child_id, status, created_at);

CREATE TABLE IF NOT EXISTS profile_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES profile_agent_runs(run_id),
  document_id TEXT NOT NULL REFERENCES source_documents(document_id),
  page_number INTEGER NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('A','B','C','D','E','F')),
  direction TEXT NOT NULL CHECK (direction IN ('strength','support_needed','neutral')),
  prompt_level TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_evidence_run_domain ON profile_evidence(run_id, domain);

CREATE TABLE IF NOT EXISTS personalized_question_sets (
  question_set_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES profile_agent_runs(run_id),
  child_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','effective','history','rejected')),
  version INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_set_child_status ON personalized_question_sets(child_id, status, created_at);

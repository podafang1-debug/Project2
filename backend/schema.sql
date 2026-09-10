PRAGMA journal_mode = WAL;

-- database-backed application identity and training state
CREATE TABLE IF NOT EXISTS roles (
  role_code TEXT PRIMARY KEY CHECK (role_code IN ('child','parent','teacher')),
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_code TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(role_code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(permission_code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission
ON role_permissions(permission_code, role_code);

CREATE TABLE IF NOT EXISTS app_users (
  phone TEXT PRIMARY KEY CHECK (
    length(phone) = 11 AND
    phone GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  ),
  user_id TEXT GENERATED ALWAYS AS (phone) STORED UNIQUE,
  role TEXT NOT NULL REFERENCES roles(role_code),
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 120000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);

CREATE TABLE IF NOT EXISTS account_roles (
  user_id TEXT NOT NULL REFERENCES app_users(phone) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(role_code) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_code)
);
CREATE INDEX IF NOT EXISTS idx_account_roles_role
ON account_roles(role_code, user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(phone) ON DELETE CASCADE,
  active_role TEXT NOT NULL REFERENCES roles(role_code),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_login_failures (
  client_key TEXT NOT NULL,
  account_key TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_started TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (client_key, account_key)
);

CREATE TABLE IF NOT EXISTS children (
  child_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_children_status ON children(status, updated_at);

CREATE TABLE IF NOT EXISTS user_child_bindings (
  binding_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(phone) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  UNIQUE(user_id, child_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_user_child_bindings_access
ON user_child_bindings(user_id, child_id, status, valid_to);

CREATE TABLE IF NOT EXISTS training_records (
  record_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  domain TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_records_child_created
ON training_records(child_id, created_at);

CREATE TABLE IF NOT EXISTS safety_flags (
  flag_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','resolved')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_safety_flags_child_status
ON safety_flags(child_id, status, created_at);
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS organizations (
  organization_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_classes (
  class_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS content_items (
  content_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','published','rejected','archived')),
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status, updated_at);

CREATE TABLE IF NOT EXISTS content_versions (
  version_id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(content_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','published','rejected','history')),
  payload TEXT NOT NULL,
  review_reason TEXT,
  created_by TEXT NOT NULL REFERENCES app_users(phone),
  reviewed_by TEXT REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(content_id, version)
);
CREATE INDEX IF NOT EXISTS idx_content_versions_item ON content_versions(content_id, version DESC);

CREATE TABLE IF NOT EXISTS consent_records (
  consent_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','revoked','superseded')),
  scope TEXT NOT NULL,
  confirmed_by TEXT NOT NULL REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_child_status ON consent_records(child_id, status, created_at);

CREATE TABLE IF NOT EXISTS data_requests (
  request_id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('deletion','export','correction')),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','completed','rejected')),
  requested_by TEXT NOT NULL REFERENCES app_users(phone),
  resolution_note TEXT,
  resolved_by TEXT REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_requests_status ON data_requests(status, created_at);

CREATE TABLE IF NOT EXISTS sharing_grants (
  grant_id TEXT PRIMARY KEY,
  target_organization TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','revoked','expired')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sharing_grants_status_date ON sharing_grants(status, valid_to);

CREATE TABLE IF NOT EXISTS backup_runs (
  backup_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created','verified','failed')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  integrity_result TEXT,
  created_by TEXT NOT NULL REFERENCES app_users(phone),
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON backup_runs(created_at DESC);

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

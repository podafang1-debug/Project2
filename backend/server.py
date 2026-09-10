"""启智训练台本地后端。

只使用 Python 标准库即可运行：
1. 提供静态网站；2. 用 SQLite 持久保存画像和评估；
3. 在服务端执行角色权限检查；4. 安全代理本机 Ollama 免费模型。

启动：python backend/server.py
访问：http://127.0.0.1:8876
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import socket
import sqlite3
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_FILE = Path(__file__).resolve().parent / "training_platform.db"
BACKUP_DIR = Path(__file__).resolve().parent / "backups"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen3:0.6b"
DOMAINS = {"A", "B", "C", "D", "E", "F"}
ASSESSMENT_TOOL_DOMAINS = {
    "GESELL": {"A", "B", "C", "D", "F"}, "GRIFFITHS": DOMAINS, "WISC": {"A", "B", "C", "D"},
    "DDST": {"D", "E", "F"}, "SOCIAL_LIFE": {"D", "E", "F"}, "VINELAND": {"D", "E", "F"},
    "SS_LANGUAGE": {"B", "D", "E"}, "LANGUAGE_DELAY": {"D"}, "PEP3": {"A", "D", "E", "F"},
    "VBMAPP": {"B", "D", "E"}, "ABLLSR": {"B", "C", "D", "E", "F"}, "ABC": {"A", "E"},
    "CARS": {"A", "D", "E"}, "VABS": {"D", "E", "F"}, "FAMILY_OBSERVATION": {"D", "E", "F"}, "platform-baseline-v1": DOMAINS,
}

# 后端权限是最终边界，前端菜单隐藏仅用于改善体验。
ROLE_ACTIONS = {
    "child": {"session:read", "profile:create", "profile:read", "ai:generate", "questions:read", "training:create"},
    "parent": {"session:read", "profile:read", "observation:create", "intervention:create", "care:confirm", "consent:write", "data-request:create", "questions:read", "training:create"},
    "teacher": {"session:read", "child:write", "child:delete", "profile:create", "profile:read", "assessment:create", "ai:generate", "intervention:create", "care:write", "care:sign", "safety:flag", "safety:resolve", "import:create", "import:read", "import:review", "import:commit", "agent:run", "agent:review", "questions:read", "training:create"},
    "admin": {"session:read", "profile:summary", "content:review", "content:publish", "organization:manage", "account:manage", "audit:read", "operations:read", "consent:govern", "sharing:manage", "backup:manage", "session:manage", "import:summary"},
}

SESSION_HOURS = 12
PASSWORD_ITERATIONS = 310_000
LEGACY_DEMO_USER_IDS = {"user_child", "user_parent", "user_teacher", "user_admin", "user_doctor", "user_reviewer"}
ROLE_NAMES = {"child": "儿童", "parent": "家长", "teacher": "康复医疗专业人员", "admin": "内容与机构管理员"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_user(row: sqlite3.Row | dict) -> dict:
    user = dict(row)
    phone = user.get("phone") or user["user_id"]
    return {"userId": phone, "phone": phone, "role": user["role"], "displayName": user["display_name"]}


def append_audit(database: sqlite3.Connection, user: dict, action: str, target_type: str, target_id: str, detail: dict) -> None:
    payload = {"actorUserId": user["user_id"], "actorName": user["display_name"], **detail}
    database.execute(
        "INSERT INTO audit_logs(audit_id,actor_role,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)",
        ("AUD-"+uuid.uuid4().hex, user["role"], action, target_type, target_id, json.dumps(payload, ensure_ascii=False), utc_now()),
    )


def opaque_ref(value: str, prefix: str = "REF") -> str:
    return prefix + "-" + hashlib.sha256(("qizhi-admin-ref:" + str(value)).encode("utf-8")).hexdigest()[:12].upper()


def parse_iso(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


class ClosingConnection(sqlite3.Connection):
    """让 `with connect()` 在提交/回滚后真正关闭连接，避免批量OCR耗尽句柄。"""
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def connect() -> sqlite3.Connection:
    database = sqlite3.connect(DATABASE_FILE, factory=ClosingConnection)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA foreign_keys = ON")
    return database


def initialise_database() -> None:
    schema = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    with connect() as database:
        migrate_legacy_identity_schema(database)
        database.executescript(schema)
        sync_permission_catalog(database)
        seed_reference_data(database)
        database.execute("PRAGMA optimize")


def normalize_phone(value: object) -> str:
    raw = str(value or "").strip()
    if any(character not in "0123456789+-()" and not character.isspace() for character in raw):
        raise ValueError("请输入有效的 11 位手机号码")
    phone = "".join(character for character in raw if character in "0123456789")
    if phone.startswith("86") and len(phone) == 13:
        phone = phone[2:]
    if len(phone) != 11 or phone[0] != "1" or phone[1] not in "3456789":
        raise ValueError("请输入有效的 11 位手机号码")
    return phone


def validate_password(value: object) -> str:
    password = str(value or "")
    if len(password) < 8 or len(password) > 72 or not any(ch.isalpha() for ch in password) or not any(ch.isdigit() for ch in password):
        raise ValueError("密码须为 8–72 位，并同时包含字母和数字")
    return password


def password_digest(password: str, salt: str, iterations: int = PASSWORD_ITERATIONS) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations).hex()


def migrate_legacy_identity_schema(database: sqlite3.Connection) -> None:
    """将只含示例账号的旧身份表迁移为手机号主键，不触碰业务数据表。"""
    columns = {row["name"] for row in database.execute("PRAGMA table_info(app_users)").fetchall()}
    if not columns or "phone" in columns:
        return
    legacy_users = {row["user_id"] for row in database.execute("SELECT user_id FROM app_users").fetchall()}
    unexpected = legacy_users - LEGACY_DEMO_USER_IDS
    if unexpected:
        raise RuntimeError("检测到没有手机号的旧正式账号，请先人工补充手机号再迁移")
    # 先按外键正常删除示例身份及其会话、授权；若存在受保护业务引用则立即失败，不做级联清空。
    for user_id in sorted(legacy_users):
        database.execute("DELETE FROM app_users WHERE user_id=?", (user_id,))
    database.commit()
    database.execute("PRAGMA foreign_keys=OFF")
    database.execute("DROP TABLE IF EXISTS auth_login_failures")
    database.execute("CREATE TABLE IF NOT EXISTS roles(role_code TEXT PRIMARY KEY CHECK(role_code IN ('child','parent','teacher','admin')),display_name TEXT NOT NULL)")
    for role, display_name in ROLE_NAMES.items():
        database.execute("INSERT OR IGNORE INTO roles(role_code,display_name) VALUES(?,?)", (role, display_name))
    database.execute("CREATE TABLE app_users_new(phone TEXT PRIMARY KEY CHECK(length(phone)=11 AND phone GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),user_id TEXT GENERATED ALWAYS AS (phone) STORED UNIQUE,role TEXT NOT NULL REFERENCES roles(role_code),display_name TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,password_iterations INTEGER NOT NULL CHECK(password_iterations>=120000),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,password_changed_at TEXT NOT NULL)")
    database.execute("DROP TABLE app_users")
    database.execute("ALTER TABLE app_users_new RENAME TO app_users")
    database.commit()
    database.execute("PRAGMA foreign_keys=ON")


def sync_permission_catalog(database: sqlite3.Connection) -> None:
    for role, display_name in ROLE_NAMES.items():
        database.execute("INSERT INTO roles(role_code,display_name) VALUES(?,?) ON CONFLICT(role_code) DO UPDATE SET display_name=excluded.display_name", (role, display_name))
    expected = {(role, permission) for role, permissions in ROLE_ACTIONS.items() for permission in permissions}
    for permission in sorted({permission for _, permission in expected}):
        database.execute("INSERT OR IGNORE INTO permissions(permission_code,description) VALUES(?,?)", (permission, permission))
    database.execute("DELETE FROM role_permissions")
    database.executemany("INSERT INTO role_permissions(role_code,permission_code) VALUES(?,?)", sorted(expected))


def seed_reference_data(database: sqlite3.Connection) -> None:
    """只保留非账号参考数据；正式账号由首次初始化或管理员创建。"""
    timestamp = utc_now()
    demo_children = (
        {"id": "c1", "name": "小明（化名）", "avatarColor": "#4F86F7", "birthYear": 2018, "baseline": {"attention": 45, "memory": 55, "logic": 40}, "note": "对声音敏感，偏爱动物与图形卡片", "status": "在训", "createdAt": timestamp},
        {"id": "c2", "name": "乐乐（化名）", "avatarColor": "#F7A14F", "birthYear": 2019, "baseline": {"attention": 60, "memory": 50, "logic": 65}, "note": "视觉偏好强，能跟读简单指令", "status": "在训", "createdAt": timestamp},
    )
    for child in demo_children:
        database.execute(
            "INSERT OR IGNORE INTO children(child_id,status,payload,created_at,updated_at) VALUES(?,?,?,?,?)",
            (child["id"], child["status"], json.dumps(child, ensure_ascii=False), child["createdAt"], timestamp),
        )
    database.execute(
        "INSERT OR IGNORE INTO organizations(organization_id,name,status,created_at,updated_at) VALUES('org_001','康宇儿童发展中心','active',?,?)",
        (timestamp, timestamp),
    )
    for class_id, name in (("class_001", "启航班"), ("class_002", "成长班")):
        database.execute(
            "INSERT OR IGNORE INTO organization_classes(class_id,organization_id,name,status,created_at) VALUES(?, 'org_001', ?, 'active', ?)",
            (class_id, name, timestamp),
        )


def decode_rows(rows: list[sqlite3.Row], key: str = "payload") -> list[dict]:
    return [json.loads(row[key]) for row in rows]


def valid_scores(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        raise ValueError("scores 必须是对象")
    result = {}
    for key, score in value.items():
        if key in DOMAINS and isinstance(score, (int, float)):
            result[key] = max(0, min(100, round(score)))
    if not result:
        raise ValueError("至少需要一个有效领域分数")
    return result


class ApiHandler(SimpleHTTPRequestHandler):
    """同源提供网页与 JSON API，避免儿童数据跨域传输。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def json_response(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("请求内容过大")
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict):
            raise ValueError("请求必须是 JSON 对象")
        return value

    def read_pdf_uploads(self) -> list[tuple[str, bytes]]:
        """解析本地网页发来的 multipart PDF；不接受非PDF和路径穿越。"""
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type or "boundary=" not in content_type:
            raise ValueError("请使用PDF文件上传")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 500_000_000:
            raise ValueError("单批文件总大小必须在500MB以内")
        boundary = content_type.split("boundary=", 1)[1].strip().strip('"').encode()
        body = self.rfile.read(length)
        files = []
        for part in body.split(b"--" + boundary):
            if b"\r\n\r\n" not in part or b"filename=" not in part:
                continue
            header, payload = part.split(b"\r\n\r\n", 1)
            payload = payload.rstrip(b"\r\n-")
            header_text = header.decode("utf-8", errors="replace")
            filename_match = __import__("re").search(r'filename="([^"]+)"', header_text)
            filename = Path(filename_match.group(1)).name if filename_match else "document.pdf"
            if not filename.lower().endswith(".pdf") or not payload.startswith(b"%PDF"):
                raise ValueError(f"{filename} 不是有效PDF")
            files.append((filename, payload))
        if not files:
            raise ValueError("没有收到PDF文件")
        return files

    def authenticated_user(self) -> dict:
        cached = getattr(self, "_authenticated_user", None)
        if cached:
            return cached
        header = self.headers.get("Authorization", "")
        token = header[7:].strip() if header.startswith("Bearer ") else ""
        if not token:
            raise PermissionError("登录会话缺失或已过期")
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with connect() as database:
            row = database.execute(
                """SELECT u.phone AS user_id,u.phone,u.role,u.display_name,u.status,s.expires_at
                   FROM auth_sessions s JOIN app_users u ON u.phone=s.user_id
                   WHERE s.token_hash=? AND u.status='active' AND s.expires_at>?""",
                (token_hash, utc_now()),
            ).fetchone()
        if not row:
            raise PermissionError("登录会话缺失或已过期")
        self._authenticated_user = dict(row)
        self._session_token_hash = token_hash
        return self._authenticated_user

    def require(self, action: str) -> str:
        user = self.authenticated_user()
        role = user["role"]
        with connect() as database:
            permitted = database.execute("SELECT 1 FROM role_permissions WHERE role_code=? AND permission_code=?", (role, action)).fetchone()
        if not permitted:
            raise PermissionError(f"角色 {role} 无权执行 {action}")
        return role

    def authorized_child_ids(self) -> list[str]:
        user = self.authenticated_user()
        if user["role"] == "admin":
            return []
        with connect() as database:
            rows = database.execute(
                """SELECT child_id FROM user_child_bindings
                   WHERE user_id=? AND status='active' AND (valid_to IS NULL OR valid_to>=?)""",
                (user["user_id"], utc_now()[:10]),
            ).fetchall()
        return [row["child_id"] for row in rows]

    def require_child_access(self, child_id: str) -> None:
        if not child_id or child_id not in self.authorized_child_ids():
            raise PermissionError("当前账号未获得该儿童的数据授权")

    def require_admin_confirmation(self, data: dict, action: str) -> dict:
        self.require(action)
        user = self.authenticated_user()
        password = str(data.get("confirmationPassword", ""))
        if not password:
            raise PermissionError("请输入当前管理员密码完成二次确认")
        with connect() as database:
            row = database.execute("SELECT password_salt,password_hash,password_iterations FROM app_users WHERE phone=? AND status='active'", (user["user_id"],)).fetchone()
        if not row or not hmac.compare_digest(password_digest(password, row["password_salt"], row["password_iterations"]), row["password_hash"]):
            raise PermissionError("管理员二次确认失败")
        return user

    def child_id_from_ref(self, database: sqlite3.Connection, child_ref: str) -> str:
        for row in database.execute("SELECT child_id FROM children").fetchall():
            if opaque_ref(row["child_id"], "CHILD") == child_ref:
                return row["child_id"]
        raise ValueError("儿童脱敏引用不存在")

    def login(self, data: dict) -> None:
        try:
            phone = normalize_phone(data.get("phone"))
        except ValueError:
            raise PermissionError("手机号或密码错误") from None
        password = str(data.get("password", ""))
        if not password or len(password) > 72:
            raise PermissionError("手机号或密码错误")
        client_key = hashlib.sha256(self.client_address[0].encode("utf-8")).hexdigest()
        account_key = hashlib.sha256(phone.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc)
        with connect() as database:
            failure = database.execute("SELECT * FROM auth_login_failures WHERE client_key=? AND account_key=?", (client_key, account_key)).fetchone()
            locked_until = parse_iso(failure["locked_until"]) if failure else None
            if locked_until and locked_until > now:
                raise PermissionError("登录尝试过多，请稍后再试")
            row = database.execute("SELECT phone AS user_id,phone,role,display_name,password_salt,password_hash,password_iterations FROM app_users WHERE phone=? AND status='active'", (phone,)).fetchone()
            salt = row["password_salt"] if row else "00" * 16; iterations = row["password_iterations"] if row else PASSWORD_ITERATIONS
            expected_hash = row["password_hash"] if row else "00" * 32
            valid = bool(row) and hmac.compare_digest(password_digest(password, salt, iterations), expected_hash)
            if not valid:
                window_started = parse_iso(failure["window_started"]) if failure else None
                count = (failure["fail_count"] if failure and window_started and (now-window_started).total_seconds() < 900 else 0) + 1
                start = window_started if count > 1 and window_started else now
                lock = (now + timedelta(minutes=15)).isoformat() if count >= 5 else None
                database.execute("""INSERT INTO auth_login_failures(client_key,account_key,fail_count,window_started,locked_until,updated_at)
                    VALUES(?,?,?,?,?,?) ON CONFLICT(client_key,account_key) DO UPDATE SET fail_count=excluded.fail_count,window_started=excluded.window_started,locked_until=excluded.locked_until,updated_at=excluded.updated_at""",
                    (client_key, account_key, count, start.isoformat(), lock, now.isoformat()))
                database.commit()
                raise PermissionError("手机号或密码错误")
            database.execute("DELETE FROM auth_login_failures WHERE client_key=? AND account_key=?", (client_key, account_key))
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            expires_at = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat()
            database.execute("DELETE FROM auth_sessions WHERE expires_at<=?", (utc_now(),))
            database.execute(
                "INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                (token_hash, row["user_id"], expires_at, utc_now()),
            )
            child_rows = database.execute(
                "SELECT child_id FROM user_child_bindings WHERE user_id=? AND status='active' AND (valid_to IS NULL OR valid_to>=?)",
                (row["user_id"], utc_now()[:10]),
            ).fetchall()
            append_audit(database, dict(row), "LOGIN_SUCCEEDED", "session", opaque_ref(token, "SESSION"), {})
        self.json_response(200, {
            "token": token,
            "expiresAt": expires_at,
            "user": public_user(row),
            "authorizedChildIds": [item["child_id"] for item in child_rows],
        })

    def bootstrap_admin(self, data: dict) -> None:
        phone = normalize_phone(data.get("phone")); password = validate_password(data.get("password")); display_name = str(data.get("displayName", "")).strip()
        if len(display_name) < 2 or len(display_name) > 40:
            raise ValueError("管理员姓名须为 2–40 个字符")
        salt = secrets.token_hex(16); timestamp = utc_now()
        with connect() as database:
            database.execute("BEGIN IMMEDIATE")
            if database.execute("SELECT 1 FROM app_users LIMIT 1").fetchone():
                raise PermissionError("系统已完成初始化，请由管理员创建账号")
            database.execute("INSERT INTO app_users(phone,role,display_name,password_salt,password_hash,password_iterations,status,created_at,updated_at,password_changed_at) VALUES(?,'admin',?,?,?,?, 'active',?,?,?)", (phone, display_name, salt, password_digest(password, salt), PASSWORD_ITERATIONS, timestamp, timestamp, timestamp))
            created = {"user_id": phone, "phone": phone, "role": "admin", "display_name": display_name}
            append_audit(database, created, "INITIAL_ADMIN_CREATED", "account", opaque_ref(phone, "ACCOUNT"), {})
        self.json_response(201, {"created": True})

    def logout(self) -> None:
        self.authenticated_user()
        with connect() as database:
            database.execute("DELETE FROM auth_sessions WHERE token_hash=?", (self._session_token_hash,))
        self.json_response(200, {"loggedOut": True})

    def send_bootstrap(self) -> None:
        role = self.require("session:read")
        user = self.authenticated_user()
        if role == "admin":
            with connect() as database:
                children_count = database.execute("SELECT COUNT(*) n FROM children").fetchone()["n"]
                training_count = database.execute("SELECT COUNT(*) n FROM training_records WHERE COALESCE(json_extract(payload,'$.source'),'')<>'baseline-game'").fetchone()["n"]
            self.json_response(200, {
                "user": public_user(user),
                "authorizedChildIds": [],
                "children": [],
                "trainingRecords": [],
                "abilityProfiles": [],
                "aiInferences": [],
                "assessments": [],
                "careRecords": [],
                "safetyFlags": [],
                "anonymousSummary": {"children": children_count, "trainingRecords": training_count},
            })
            return
        child_ids = self.authorized_child_ids()
        if not child_ids:
            self.json_response(200, {
                "user": public_user(user),
                "authorizedChildIds": [], "children": [], "trainingRecords": [], "abilityProfiles": [],
                "aiInferences": [], "assessments": [], "careRecords": [], "safetyFlags": [],
            })
            return
        placeholders = ",".join("?" for _ in child_ids)
        with connect() as database:
            child_rows = database.execute(f"SELECT payload FROM children WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
            training_rows = database.execute(f"SELECT payload FROM training_records WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
            profile_rows = database.execute(f"SELECT payload FROM ability_profiles WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
            inference_rows = database.execute(f"""SELECT i.payload FROM ai_inferences i JOIN ability_profiles p ON p.profile_id=i.profile_id
                                                  WHERE p.child_id IN ({placeholders}) ORDER BY i.created_at""", child_ids).fetchall()
            assessment_rows = database.execute(f"SELECT payload FROM assessments WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
            care_rows = database.execute(f"SELECT payload FROM care_records WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
            safety_rows = database.execute(f"SELECT payload FROM safety_flags WHERE child_id IN ({placeholders}) ORDER BY created_at", child_ids).fetchall()
        self.json_response(200, {
            "user": public_user(user),
            "authorizedChildIds": child_ids,
            "children": decode_rows(child_rows),
            "trainingRecords": decode_rows(training_rows),
            "abilityProfiles": decode_rows(profile_rows),
            "aiInferences": decode_rows(inference_rows),
            "assessments": decode_rows(assessment_rows),
            "careRecords": decode_rows(care_rows),
            "safetyFlags": decode_rows(safety_rows),
        })

    def admin_content(self) -> None:
        self.require("content:review")
        with connect() as database:
            items = database.execute("SELECT * FROM content_items ORDER BY updated_at DESC").fetchall()
            versions = database.execute("SELECT * FROM content_versions ORDER BY content_id,version DESC").fetchall()
        grouped: dict[str, list[dict]] = {}
        for row in versions:
            item = dict(row); item["payload"] = json.loads(item["payload"]); grouped.setdefault(item["content_id"], []).append(item)
        payload = []
        for row in items:
            item = dict(row); item["versions"] = grouped.get(item["content_id"], []); payload.append(item)
        self.json_response(200, {"items": payload})

    def admin_organizations(self) -> None:
        self.require("organization:manage")
        with connect() as database:
            organizations = [dict(row) for row in database.execute("SELECT * FROM organizations ORDER BY name").fetchall()]
            classes = [dict(row) for row in database.execute("SELECT * FROM organization_classes ORDER BY organization_id,name").fetchall()]
        self.json_response(200, {"organizations": organizations, "classes": classes})

    def admin_accounts(self) -> None:
        self.require("account:manage")
        with connect() as database:
            users = [dict(row) for row in database.execute("SELECT phone AS user_id,phone,role,display_name,status,created_at,password_changed_at FROM app_users ORDER BY role,created_at").fetchall()]
            bindings = database.execute("SELECT binding_id,user_id,child_id,scope,status,valid_from,valid_to FROM user_child_bindings ORDER BY user_id,valid_from").fetchall()
            child_rows = database.execute("SELECT child_id FROM children ORDER BY created_at").fetchall()
            sessions = database.execute("SELECT user_id,COUNT(*) count FROM auth_sessions WHERE expires_at>? GROUP BY user_id", (utc_now(),)).fetchall()
        session_counts = {row["user_id"]: row["count"] for row in sessions}
        for user in users:
            user["activeSessions"] = session_counts.get(user["user_id"], 0)
            user["bindings"] = [{"bindingId": row["binding_id"], "childRef": opaque_ref(row["child_id"], "CHILD"), "scope": row["scope"], "status": row["status"], "validFrom": row["valid_from"], "validTo": row["valid_to"]} for row in bindings if row["user_id"] == user["user_id"]]
        self.json_response(200, {"users": users, "children": [{"childRef": opaque_ref(row["child_id"], "CHILD")} for row in child_rows]})

    def admin_audit(self) -> None:
        self.require("audit:read")
        with connect() as database:
            rows = database.execute("SELECT actor_role,action,target_type,target_id,detail,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100").fetchall()
        items = []
        for row in rows:
            try:
                detail = json.loads(row["detail"] or "{}")
            except (TypeError, json.JSONDecodeError):
                detail = {}
            items.append({"actorRole": row["actor_role"], "actorName": detail.get("actorName") or row["actor_role"], "action": row["action"], "targetType": row["target_type"], "targetRef": opaque_ref(row["target_id"], "TARGET"), "createdAt": row["created_at"]})
        self.json_response(200, {"items": items, "redacted": True})

    def admin_operations(self) -> None:
        self.require("operations:read")
        now = datetime.now(timezone.utc); since_7 = (now-timedelta(days=7)).isoformat(); since_30 = (now-timedelta(days=30)).isoformat()
        with connect() as database:
            scalar = lambda sql, params=(): database.execute(sql, params).fetchone()[0]
            users = {row["role"]: row["count"] for row in database.execute("SELECT role,COUNT(*) count FROM app_users WHERE status='active' GROUP BY role").fetchall()}
            content = {row["status"]: row["count"] for row in database.execute("SELECT status,COUNT(*) count FROM content_items GROUP BY status").fetchall()}
            imports = {row["status"]: row["count"] for row in database.execute("SELECT status,COUNT(*) count FROM import_batches GROUP BY status").fetchall()}
            daily = [dict(row) for row in database.execute("SELECT substr(created_at,1,10) day,COUNT(*) trainingRecords FROM training_records WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY day", (since_30,)).fetchall()]
            result = {"children": scalar("SELECT COUNT(*) FROM children"), "trainingTotal": scalar("SELECT COUNT(*) FROM training_records WHERE COALESCE(json_extract(payload,'$.source'),'')<>'baseline-game'"), "training7Days": scalar("SELECT COUNT(*) FROM training_records WHERE created_at>=? AND COALESCE(json_extract(payload,'$.source'),'')<>'baseline-game'", (since_7,)), "activeRisks": scalar("SELECT COUNT(*) FROM safety_flags WHERE status='active'"), "pendingRequests": scalar("SELECT COUNT(*) FROM data_requests WHERE status IN ('pending','processing')"), "activeConsents": scalar("SELECT COUNT(*) FROM consent_records WHERE status='active'"), "usersByRole": users, "contentByStatus": content, "importsByStatus": imports, "daily": daily}
        self.json_response(200, result)

    def admin_governance(self) -> None:
        self.require("consent:govern")
        with connect() as database:
            consent_counts = {row["status"]: row["count"] for row in database.execute("SELECT status,COUNT(*) count FROM consent_records GROUP BY status").fetchall()}
            requests = database.execute("SELECT request_id,child_id,request_type,status,created_at,resolved_at FROM data_requests ORDER BY created_at DESC LIMIT 100").fetchall()
        self.json_response(200, {"consents": consent_counts, "requests": [{"requestId": row["request_id"], "childRef": opaque_ref(row["child_id"], "CHILD"), "type": row["request_type"], "status": row["status"], "createdAt": row["created_at"], "resolvedAt": row["resolved_at"]} for row in requests]})

    def admin_sharing(self) -> None:
        self.require("sharing:manage")
        today = utc_now()[:10]
        with connect() as database:
            database.execute("UPDATE sharing_grants SET status='expired' WHERE status='active' AND valid_to<?", (today,))
            rows = database.execute("SELECT grant_id,target_organization,scope,status,valid_from,valid_to,created_at,revoked_at FROM sharing_grants ORDER BY created_at DESC").fetchall()
        self.json_response(200, {"grants": [dict(row) for row in rows]})

    def admin_backups(self) -> None:
        self.require("backup:manage")
        with connect() as database:
            rows = database.execute("SELECT backup_id,file_name,status,size_bytes,integrity_result,created_at,verified_at FROM backup_runs ORDER BY created_at DESC LIMIT 20").fetchall()
        self.json_response(200, {"backups": [dict(row) for row in rows], "downloadAllowed": False})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            with connect() as database:
                setup_required = database.execute("SELECT 1 FROM app_users LIMIT 1").fetchone() is None
            self.json_response(200, {"ok": True, "storage": "sqlite", "accountSetupRequired": setup_required, "aiModel": OLLAMA_MODEL, "ocr": {"available": True, "mode": "isolated-process"}})
            return
        if parsed.path == "/api/bootstrap":
            self.send_bootstrap()
            return
        admin_routes = {
            "/api/admin/content": self.admin_content, "/api/admin/organizations": self.admin_organizations,
            "/api/admin/accounts": self.admin_accounts, "/api/admin/audit": self.admin_audit,
            "/api/admin/operations": self.admin_operations, "/api/admin/governance": self.admin_governance,
            "/api/admin/sharing": self.admin_sharing, "/api/admin/backups": self.admin_backups,
        }
        if parsed.path in admin_routes:
            try: admin_routes[parsed.path]()
            except PermissionError as error: self.json_response(403, {"error": str(error)})
            return
        if parsed.path == "/api/profiles/current":
            try:
                self.require("profile:read")
                child_id = parse_qs(parsed.query).get("child_id", [""])[0]
                self.require_child_access(child_id)
                with connect() as database:
                    row = database.execute(
                        "SELECT payload FROM ability_profiles WHERE child_id=? AND status='current' ORDER BY created_at DESC LIMIT 1",
                        (child_id,),
                    ).fetchone()
                self.json_response(200, {"profile": json.loads(row["payload"]) if row else None})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path == "/api/imports/batches":
            try:
                role = self.authenticated_user()["role"]
                self.require("import:read" if role == "teacher" else "import:summary")
                with connect() as database:
                    error_column = "NULL AS error_message" if role == "admin" else "b.error_message"
                    rows = database.execute(f"""SELECT b.batch_id,b.status,b.total_documents,b.processed_documents,{error_column},b.created_at,b.updated_at,
                        COALESCE(SUM(d.page_count),0) AS total_pages,
                        (SELECT COUNT(*) FROM document_pages p WHERE p.document_id IN (SELECT document_id FROM source_documents WHERE batch_id=b.batch_id)) AS processed_pages
                        FROM import_batches b LEFT JOIN source_documents d ON d.batch_id=b.batch_id
                        GROUP BY b.batch_id ORDER BY b.created_at DESC LIMIT 30""").fetchall()
                self.json_response(200, {"batches": [dict(row) for row in rows]})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path.startswith("/api/imports/batches/"):
            try:
                self.require("import:read")
                batch_id = parsed.path.rsplit("/", 1)[-1]
                with connect() as database:
                    batch = database.execute("SELECT * FROM import_batches WHERE batch_id=?", (batch_id,)).fetchone()
                    documents = database.execute("""SELECT d.document_id,d.original_name,d.page_count,d.status,
                        (SELECT COUNT(*) FROM document_pages p WHERE p.document_id=d.document_id) AS processed_pages
                        FROM source_documents d WHERE d.batch_id=? ORDER BY d.created_at""", (batch_id,)).fetchall()
                    fields = database.execute("SELECT field_id,document_id,page_number,field_key,field_label,extracted_value,confidence,sensitivity,review_status,reviewed_value,evidence_json FROM extracted_fields WHERE document_id IN (SELECT document_id FROM source_documents WHERE batch_id=?) ORDER BY document_id,page_number", (batch_id,)).fetchall()
                if not batch:
                    self.json_response(404, {"error": "导入批次不存在"}); return
                field_list = []
                for row in fields:
                    item = dict(row); item["evidence"] = json.loads(item.pop("evidence_json")); field_list.append(item)
                self.json_response(200, {"batch": dict(batch), "documents": [dict(row) for row in documents], "fields": field_list})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path == "/api/agent/runs/current":
            try:
                self.require("import:read")
                child_id = parse_qs(parsed.query).get("child_id", [""])[0]
                self.require_child_access(child_id)
                with connect() as database:
                    row = database.execute("SELECT * FROM profile_agent_runs WHERE child_id=? ORDER BY created_at DESC LIMIT 1", (child_id,)).fetchone()
                if not row:
                    self.json_response(200, {"run": None}); return
                run = dict(row); run["profile"] = json.loads(run.pop("profile_payload")); run["solution"] = json.loads(run.pop("solution_payload"))
                self.json_response(200, {"run": run})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path == "/api/personalized/levels":
            try:
                self.require("questions:read")
                query = parse_qs(parsed.query)
                child_id = query.get("child_id", [""])[0]
                excluded = [item for item in query.get("excluded", [""])[0].split(",") if item]
                self.require_child_access(child_id)
                with connect() as database:
                    child_row = database.execute("SELECT payload FROM children WHERE child_id=?", (child_id,)).fetchone()
                    profile_row = database.execute("SELECT payload FROM ability_profiles WHERE child_id=? AND status='current' ORDER BY created_at DESC LIMIT 1", (child_id,)).fetchone()
                    assessment_rows = database.execute("SELECT payload FROM assessments WHERE child_id=? ORDER BY created_at DESC LIMIT 20", (child_id,)).fetchall()
                    training_rows = database.execute("SELECT payload FROM training_records WHERE child_id=? ORDER BY created_at DESC LIMIT 240", (child_id,)).fetchall()
                from level_agent import build_curriculum
                curriculum = build_curriculum(
                    json.loads(profile_row["payload"]) if profile_row else None,
                    json.loads(child_row["payload"]) if child_row else None,
                    decode_rows(assessment_rows),
                    list(reversed(decode_rows(training_rows))),
                    excluded,
                )
                self.json_response(200, {"curriculum": curriculum})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            except ValueError as error:
                self.json_response(400, {"error": str(error)})
            return
        if parsed.path == "/api/personalized/questions":
            try:
                self.require("questions:read")
                query = parse_qs(parsed.query); child_id = query.get("child_id", [""])[0]; module_id = query.get("module_id", [""])[0]
                self.require_child_access(child_id)
                with connect() as database:
                    row = database.execute("SELECT payload FROM personalized_question_sets WHERE child_id=? AND status='effective' ORDER BY version DESC,created_at DESC LIMIT 1", (child_id,)).fetchone()
                payload = json.loads(row["payload"]) if row else None
                if payload and module_id:
                    payload = {**payload, "questions": [item for item in payload.get("questions", []) if item.get("moduleId") == module_id]}
                self.json_response(200, {"questionSet": payload})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path.startswith("/api/"):
            self.json_response(404, {"error": "接口不存在"})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        try:
            path = urlparse(self.path).path
            if path == "/api/auth/bootstrap-admin":
                self.bootstrap_admin(self.read_json()); return
            if path == "/api/auth/login":
                self.login(self.read_json()); return
            if path == "/api/auth/logout":
                self.logout(); return
            if path == "/api/imports/batches":
                self.create_import_batch(self.read_pdf_uploads()); return
            routes = {
                "/api/children": self.save_child,
                "/api/training-records": self.save_training_records,
                "/api/safety-flags": self.save_safety_flag,
                "/api/profiles": self.save_profile,
                "/api/assessments": self.save_assessment,
                "/api/interventions": self.save_intervention,
                "/api/care-records": self.save_care_record,
                "/api/ai/profile": self.generate_profile_text,
                "/api/imports/review": self.review_import_field,
                "/api/imports/commit": self.commit_import,
                "/api/agent/analyze": self.run_profile_agent,
                "/api/agent/approve": self.approve_profile_agent,
                "/api/consents": self.save_consent,
                "/api/data-requests": self.save_data_request,
                "/api/admin/content": self.manage_content,
                "/api/admin/organizations": self.manage_organization,
                "/api/admin/accounts": self.manage_account,
                "/api/admin/governance": self.manage_governance,
                "/api/admin/sharing": self.manage_sharing,
                "/api/admin/backups": self.manage_backup,
            }
            handler = routes.get(path)
            if not handler:
                self.json_response(404, {"error": "接口不存在"})
                return
            handler(self.read_json())
        except PermissionError as error:
            self.json_response(403, {"error": str(error)})
        except (ValueError, json.JSONDecodeError) as error:
            self.json_response(400, {"error": str(error)})
        except Exception as error:  # 页面收到可理解错误，服务器控制台保留技术细节。
            self.log_error("API error: %r", error)
            self.json_response(500, {"error": "本地服务暂时无法处理请求"})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            path = urlparse(self.path).path
            if path.startswith("/api/children/"):
                self.delete_child(path.rsplit("/", 1)[-1])
                return
            self.json_response(404, {"error": "接口不存在"})
        except PermissionError as error:
            self.json_response(403, {"error": str(error)})
        except ValueError as error:
            self.json_response(400, {"error": str(error)})
        except Exception as error:
            self.log_error("API delete error: %r", error)
            self.json_response(500, {"error": "本地服务暂时无法处理请求"})

    def save_consent(self, data: dict) -> None:
        self.require("consent:write")
        user = self.authenticated_user(); child_id = str(data.get("childId", "")); self.require_child_access(child_id)
        action = str(data.get("action", "save"))
        with connect() as database:
            if action == "revoke":
                rows = database.execute("SELECT consent_id FROM consent_records WHERE child_id=? AND status='active'", (child_id,)).fetchall()
                database.execute("UPDATE consent_records SET status='revoked',ended_at=? WHERE child_id=? AND status='active'", (utc_now(), child_id))
                append_audit(database, user, "CONSENT_REVOKED", "consent", opaque_ref(child_id, "CHILD"), {"count": len(rows)})
                self.json_response(200, {"revoked": len(rows)}); return
            scope = [item for item in data.get("scope", []) if item in {"training", "assessment", "media"}]
            if not scope: raise ValueError("请至少选择一项授权范围")
            timestamp = utc_now(); consent_id = "CONSENT-" + uuid.uuid4().hex
            database.execute("UPDATE consent_records SET status='superseded',ended_at=? WHERE child_id=? AND status='active'", (timestamp, child_id))
            database.execute("INSERT INTO consent_records(consent_id,child_id,status,scope,confirmed_by,created_at) VALUES(?,?,'active',?,?,?)", (consent_id, child_id, json.dumps(scope), user["user_id"], timestamp))
            append_audit(database, user, "CONSENT_SCOPE_SAVED", "consent", consent_id, {"scopeCount": len(scope)})
        self.json_response(201, {"saved": True, "consentId": consent_id})

    def save_data_request(self, data: dict) -> None:
        self.require("data-request:create")
        user = self.authenticated_user(); child_id = str(data.get("childId", "")); self.require_child_access(child_id)
        request_type = str(data.get("type", "deletion"))
        if request_type not in {"deletion", "export", "correction"}: raise ValueError("申请类型不支持")
        request_id = "REQ-" + uuid.uuid4().hex; timestamp = utc_now()
        with connect() as database:
            database.execute("INSERT INTO data_requests(request_id,child_id,request_type,status,requested_by,created_at) VALUES(?,?,?,'pending',?,?)", (request_id, child_id, request_type, user["user_id"], timestamp))
            append_audit(database, user, "DATA_REQUEST_CREATED", "data_request", request_id, {"requestType": request_type})
        self.json_response(201, {"saved": True, "requestId": request_id})

    def manage_content(self, data: dict) -> None:
        action = str(data.get("action", "save-draft")); permission = "content:publish" if action in {"publish", "rollback"} else "content:review"
        user = self.require_admin_confirmation(data, permission); timestamp = utc_now()
        with connect() as database:
            if action == "save-draft":
                content = data.get("content") if isinstance(data.get("content"), dict) else {}
                code = str(content.get("code", "")).strip().upper(); title = str(content.get("title", "")).strip(); category = str(content.get("category", "训练活动")).strip()
                if not code or not title: raise ValueError("内容编码和标题不能为空")
                content_id = str(content.get("contentId", "")).strip() or "CONTENT-" + uuid.uuid4().hex
                row = database.execute("SELECT current_version FROM content_items WHERE content_id=?", (content_id,)).fetchone()
                version = (row["current_version"] + 1) if row else 1
                payload = {"body": str(content.get("body", "")).strip(), "difficulty": max(1, min(5, int(content.get("difficulty", 1)))), "locale": str(content.get("locale", "普通话/通用场景")).strip(), "culturalReview": str(content.get("culturalReview", "")).strip(), "copyrightSource": str(content.get("copyrightSource", "")).strip(), "safetyNote": str(content.get("safetyNote", "")).strip(), "changeNote": str(content.get("changeNote", "")).strip()}
                if row:
                    database.execute("UPDATE content_items SET code=?,title=?,category=?,status='draft',current_version=?,updated_at=? WHERE content_id=?", (code, title, category, version, timestamp, content_id))
                else:
                    database.execute("INSERT INTO content_items(content_id,code,title,category,status,current_version,created_by,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?,?)", (content_id, code, title, category, version, user["user_id"], timestamp, timestamp))
                version_id = "CONTENT-V-" + uuid.uuid4().hex
                database.execute("INSERT INTO content_versions(version_id,content_id,version,status,payload,created_by,created_at) VALUES(?,?,?,'draft',?,?,?)", (version_id, content_id, version, json.dumps(payload, ensure_ascii=False), user["user_id"], timestamp))
                append_audit(database, user, "CONTENT_DRAFT_SAVED", "content", content_id, {"version": version, "code": code})
                self.json_response(201, {"saved": True, "contentId": content_id, "versionId": version_id}); return
            version_id = str(data.get("versionId", "")); version_row = database.execute("SELECT * FROM content_versions WHERE version_id=?", (version_id,)).fetchone()
            if not version_row: raise ValueError("内容版本不存在")
            content_id = version_row["content_id"]; payload = json.loads(version_row["payload"])
            if action in {"approve", "reject"}:
                reason = str(data.get("reason", "")).strip()
                if not reason: raise ValueError("请填写审核意见")
                if action == "approve" and not all(payload.get(key) for key in ("body", "culturalReview", "copyrightSource", "safetyNote", "changeNote")):
                    raise ValueError("发布前必须补齐内容、文化适配、版权来源、安全提示和版本说明")
                status = "approved" if action == "approve" else "rejected"
                database.execute("UPDATE content_versions SET status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE version_id=?", (status, reason, user["user_id"], timestamp, version_id))
                database.execute("UPDATE content_items SET status=?,updated_at=? WHERE content_id=?", (status, timestamp, content_id))
                append_audit(database, user, "CONTENT_" + status.upper(), "content", content_id, {"version": version_row["version"]})
                self.json_response(200, {"saved": True, "status": status}); return
            if action == "publish":
                if version_row["status"] != "approved": raise ValueError("只有审核通过的版本可以发布")
                database.execute("UPDATE content_versions SET status='history' WHERE content_id=? AND status='published'", (content_id,))
                database.execute("UPDATE content_versions SET status='published' WHERE version_id=?", (version_id,))
                database.execute("UPDATE content_items SET status='published',current_version=?,updated_at=? WHERE content_id=?", (version_row["version"], timestamp, content_id))
                append_audit(database, user, "CONTENT_PUBLISHED", "content", content_id, {"version": version_row["version"]})
                self.json_response(200, {"saved": True, "status": "published"}); return
            if action == "rollback":
                source = version_row; latest = database.execute("SELECT MAX(version) n FROM content_versions WHERE content_id=?", (content_id,)).fetchone()["n"] or 0; new_version = latest + 1; new_id = "CONTENT-V-" + uuid.uuid4().hex
                database.execute("UPDATE content_versions SET status='history' WHERE content_id=? AND status='published'", (content_id,))
                database.execute("INSERT INTO content_versions(version_id,content_id,version,status,payload,review_reason,created_by,reviewed_by,created_at,reviewed_at) VALUES(?,?,?,'published',?,'由历史版本回滚',?,?,?,?)", (new_id, content_id, new_version, source["payload"], user["user_id"], user["user_id"], timestamp, timestamp))
                database.execute("UPDATE content_items SET status='published',current_version=?,updated_at=? WHERE content_id=?", (new_version, timestamp, content_id))
                append_audit(database, user, "CONTENT_ROLLED_BACK", "content", content_id, {"fromVersion": source["version"], "newVersion": new_version})
                self.json_response(201, {"saved": True, "versionId": new_id, "version": new_version}); return
        raise ValueError("不支持的内容操作")

    def manage_organization(self, data: dict) -> None:
        user = self.require_admin_confirmation(data, "organization:manage"); action = str(data.get("action", "")); timestamp = utc_now()
        with connect() as database:
            if action == "create-organization":
                name = str(data.get("name", "")).strip()
                if not name: raise ValueError("机构名称不能为空")
                item_id = "ORG-" + uuid.uuid4().hex; database.execute("INSERT INTO organizations VALUES(?,?,'active',?,?)", (item_id, name, timestamp, timestamp)); target = item_id
            elif action == "create-class":
                org_id = str(data.get("organizationId", "")); name = str(data.get("name", "")).strip()
                if not org_id or not name: raise ValueError("请选择机构并填写班级名称")
                target = "CLASS-" + uuid.uuid4().hex; database.execute("INSERT INTO organization_classes VALUES(?,?,?,'active',?)", (target, org_id, name, timestamp))
            elif action == "set-status":
                target = str(data.get("id", "")); status = str(data.get("status", "")); kind = str(data.get("kind", "organization"))
                if status not in {"active", "disabled"}: raise ValueError("状态不支持")
                table, key = ("organization_classes", "class_id") if kind == "class" else ("organizations", "organization_id")
                database.execute(f"UPDATE {table} SET status=? WHERE {key}=?", (status, target))
            else: raise ValueError("不支持的机构操作")
            append_audit(database, user, "ORGANIZATION_CHANGED", "organization", target, {"action": action})
        self.json_response(200, {"saved": True})

    def manage_account(self, data: dict) -> None:
        user = self.require_admin_confirmation(data, "account:manage"); action = str(data.get("action", "")); timestamp = utc_now()
        with connect() as database:
            if action == "create":
                role = str(data.get("role", "")); display_name = str(data.get("displayName", "")).strip(); target = normalize_phone(data.get("phone")); new_password = validate_password(data.get("newPassword"))
                if role not in ROLE_ACTIONS or not display_name or len(display_name) > 40: raise ValueError("请填写有效角色和 1–40 个字符的姓名")
                if database.execute("SELECT 1 FROM app_users WHERE phone=?", (target,)).fetchone(): raise ValueError("该手机号已注册")
                salt = secrets.token_hex(16)
                database.execute("INSERT INTO app_users(phone,role,display_name,password_salt,password_hash,password_iterations,status,created_at,updated_at,password_changed_at) VALUES(?,?,?,?,?,?,'active',?,?,?)", (target, role, display_name, salt, password_digest(new_password, salt), PASSWORD_ITERATIONS, timestamp, timestamp, timestamp))
            elif action == "reset-password":
                target = normalize_phone(data.get("phone") or data.get("userId")); new_password = validate_password(data.get("newPassword"))
                if not database.execute("SELECT 1 FROM app_users WHERE phone=?", (target,)).fetchone(): raise ValueError("账号不存在")
                salt = secrets.token_hex(16); database.execute("UPDATE app_users SET password_salt=?,password_hash=?,password_iterations=?,password_changed_at=?,updated_at=? WHERE phone=?", (salt, password_digest(new_password, salt), PASSWORD_ITERATIONS, timestamp, timestamp, target)); database.execute("DELETE FROM auth_sessions WHERE user_id=?", (target,))
            elif action == "set-status":
                target = normalize_phone(data.get("phone") or data.get("userId")); status = str(data.get("status", ""))
                if target == user["user_id"] and status != "active": raise ValueError("不能停用当前管理员账号")
                if status not in {"active", "disabled"}: raise ValueError("账号状态不支持")
                if not database.execute("SELECT 1 FROM app_users WHERE phone=?", (target,)).fetchone(): raise ValueError("账号不存在")
                database.execute("UPDATE app_users SET status=?,updated_at=? WHERE phone=?", (status, timestamp, target))
                if status == "disabled": database.execute("DELETE FROM auth_sessions WHERE user_id=?", (target,))
            elif action == "revoke-sessions":
                target = normalize_phone(data.get("phone") or data.get("userId")); database.execute("DELETE FROM auth_sessions WHERE user_id=?", (target,))
            elif action == "binding-upsert":
                target = normalize_phone(data.get("phone") or data.get("userId")); child_id = self.child_id_from_ref(database, str(data.get("childRef", ""))); scope = str(data.get("scope", "authorized")); valid_to = str(data.get("validTo", "")).strip() or None
                account = database.execute("SELECT role FROM app_users WHERE phone=?", (target,)).fetchone()
                if not account or account["role"] == "admin": raise ValueError("管理员不能绑定儿童临床数据")
                expected_scope = {"child": "self", "parent": "guardian", "teacher": "rehabilitation-medical"}[account["role"]]
                if scope != expected_scope: raise PermissionError("授权范围与账号角色不匹配")
                if valid_to and valid_to < timestamp[:10]: raise ValueError("授权截止日期不能早于今天")
                binding_id = "BIND-" + uuid.uuid4().hex
                database.execute("""INSERT INTO user_child_bindings(binding_id,user_id,child_id,scope,status,valid_from,valid_to) VALUES(?,?,?,?,'active',?,?)
                    ON CONFLICT(user_id,child_id,scope) DO UPDATE SET status='active',valid_from=excluded.valid_from,valid_to=excluded.valid_to""", (binding_id, target, child_id, scope, timestamp[:10], valid_to))
            elif action == "binding-revoke":
                target = str(data.get("bindingId", "")); database.execute("UPDATE user_child_bindings SET status='revoked' WHERE binding_id=?", (target,))
            else: raise ValueError("不支持的账号操作")
            append_audit(database, user, "ACCOUNT_GOVERNANCE_CHANGED", "account", target, {"action": action})
        self.json_response(200, {"saved": True})

    def manage_governance(self, data: dict) -> None:
        user = self.require_admin_confirmation(data, "consent:govern"); request_id = str(data.get("requestId", "")); status = str(data.get("status", "")); note = str(data.get("resolutionNote", "")).strip()
        if status not in {"processing", "completed", "rejected"} or not note: raise ValueError("请选择处理状态并填写处理依据")
        with connect() as database:
            row = database.execute("SELECT request_id FROM data_requests WHERE request_id=?", (request_id,)).fetchone()
            if not row: raise ValueError("数据申请不存在")
            database.execute("UPDATE data_requests SET status=?,resolution_note=?,resolved_by=?,resolved_at=? WHERE request_id=?", (status, note, user["user_id"], utc_now(), request_id))
            append_audit(database, user, "DATA_REQUEST_STATUS_CHANGED", "data_request", request_id, {"status": status})
        self.json_response(200, {"saved": True})

    def manage_sharing(self, data: dict) -> None:
        user = self.require_admin_confirmation(data, "sharing:manage"); action = str(data.get("action", "create")); timestamp = utc_now()
        with connect() as database:
            if action == "create":
                organization = str(data.get("targetOrganization", "")).strip(); scopes = [item for item in data.get("scope", []) if item in {"training-summary", "content-library", "service-coordination"}]; valid_to = str(data.get("validTo", ""))
                if not organization or not scopes or not valid_to or valid_to < timestamp[:10]: raise ValueError("请填写接收机构、共享范围和有效截止日期")
                target = "GRANT-" + uuid.uuid4().hex; database.execute("INSERT INTO sharing_grants VALUES(?,?,?,'active',?,?,?, ?,NULL)", (target, organization, json.dumps(scopes), timestamp[:10], valid_to, user["user_id"], timestamp))
            elif action == "revoke":
                target = str(data.get("grantId", "")); database.execute("UPDATE sharing_grants SET status='revoked',revoked_at=? WHERE grant_id=? AND status='active'", (timestamp, target))
            else: raise ValueError("不支持的共享操作")
            append_audit(database, user, "SHARING_GRANT_CHANGED", "sharing_grant", target, {"action": action})
        self.json_response(200, {"saved": True})

    def manage_backup(self, data: dict) -> None:
        user = self.require_admin_confirmation(data, "backup:manage"); action = str(data.get("action", "create")); BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        if action == "create":
            backup_id = "BACKUP-" + uuid.uuid4().hex; file_name = backup_id + ".sqlite3"; path = BACKUP_DIR / file_name
            source = connect(); target = sqlite3.connect(path)
            try: source.backup(target)
            finally: target.close(); source.close()
            size = path.stat().st_size; timestamp = utc_now()
            with connect() as database:
                database.execute("INSERT INTO backup_runs(backup_id,file_name,status,size_bytes,created_by,created_at) VALUES(?,?,'created',?,?,?)", (backup_id, file_name, size, user["user_id"], timestamp))
                append_audit(database, user, "SERVER_BACKUP_CREATED", "backup", backup_id, {"sizeBytes": size})
            self.json_response(201, {"saved": True, "backupId": backup_id, "sizeBytes": size}); return
        if action == "verify":
            backup_id = str(data.get("backupId", ""))
            with connect() as database: row = database.execute("SELECT file_name FROM backup_runs WHERE backup_id=?", (backup_id,)).fetchone()
            if not row: raise ValueError("备份记录不存在")
            path = BACKUP_DIR / Path(row["file_name"]).name
            if not path.exists(): raise ValueError("备份文件不存在")
            check_db = sqlite3.connect(path)
            try: result = check_db.execute("PRAGMA integrity_check").fetchone()[0]
            finally: check_db.close()
            status = "verified" if result == "ok" else "failed"; timestamp = utc_now()
            with connect() as database:
                database.execute("UPDATE backup_runs SET status=?,integrity_result=?,verified_at=? WHERE backup_id=?", (status, result, timestamp, backup_id))
                append_audit(database, user, "SERVER_BACKUP_VERIFIED", "backup", backup_id, {"status": status})
            self.json_response(200, {"saved": True, "status": status, "integrity": result}); return
        raise ValueError("不支持的备份操作")

    def save_child(self, data: dict) -> None:
        self.require("child:write")
        child = data.get("child") if isinstance(data.get("child"), dict) else data
        child_id, name = str(child.get("id", "")).strip(), str(child.get("name", "")).strip()
        if not child_id or not name:
            raise ValueError("缺少儿童编号或称呼")
        child["id"], child["name"] = child_id, name
        child.setdefault("createdAt", utc_now())
        timestamp = utc_now()
        with connect() as database:
            exists = database.execute("SELECT 1 FROM children WHERE child_id=?", (child_id,)).fetchone()
        if exists:
            self.require_child_access(child_id)
        with connect() as database:
            database.execute(
                """INSERT INTO children(child_id,status,payload,created_at,updated_at) VALUES(?,?,?,?,?)
                   ON CONFLICT(child_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at""",
                (child_id, str(child.get("status", "在训")), json.dumps(child, ensure_ascii=False), str(child["createdAt"]), timestamp),
            )
            user = self.authenticated_user()
            database.execute(
                "INSERT OR IGNORE INTO user_child_bindings(binding_id,user_id,child_id,scope,status,valid_from,valid_to) VALUES(?,?,?,'rehabilitation-medical','active',?,NULL)",
                ("bind-" + uuid.uuid4().hex, user["user_id"], child_id, timestamp[:10]),
            )
        self.json_response(201, {"saved": True, "childId": child_id})

    def save_training_records(self, data: dict) -> None:
        self.require("training:create")
        records = data.get("records")
        if not isinstance(records, list) or not records or len(records) > 100:
            raise ValueError("训练记录必须为1至100条")
        checked = []
        for record in records:
            if not isinstance(record, dict):
                raise ValueError("训练记录格式错误")
            record_id, child_id = str(record.get("id", "")), str(record.get("childId", ""))
            if not record_id or not child_id:
                raise ValueError("训练记录缺少编号或儿童编号")
            self.require_child_access(child_id)
            checked.append((record_id, child_id, str(record.get("moduleId") or record.get("module") or ""), str(record.get("domain") or ""), json.dumps(record, ensure_ascii=False), utc_now()))
        with connect() as database:
            database.executemany(
                "INSERT OR REPLACE INTO training_records(record_id,child_id,module_id,domain,payload,created_at) VALUES(?,?,?,?,?,?)",
                checked,
            )
        self.json_response(201, {"saved": True, "count": len(checked)})

    def save_safety_flag(self, data: dict) -> None:
        child_id = str(data.get("childId", ""))
        if data.get("action") == "resolve":
            self.require("safety:resolve")
            user = self.authenticated_user()
            self.require_child_access(child_id)
            resolution = data.get("resolution") if isinstance(data.get("resolution"), dict) else {}
            resolution_note = str(resolution.get("resolutionNote", "")).strip()
            followup_plan = str(resolution.get("followupPlan", "")).strip()
            if not resolution.get("confirmed") or not resolution_note or not followup_plan:
                raise ValueError("风险解除必须包含解除依据、随访计划和专业确认")
            timestamp = utc_now()
            with connect() as database:
                rows = database.execute("SELECT flag_id,payload FROM safety_flags WHERE child_id=? AND status='active'", (child_id,)).fetchall()
                for row in rows:
                    payload = json.loads(row["payload"])
                    payload.update({
                        "status": "resolved", "resolutionNote": resolution_note, "followupPlan": followup_plan,
                        "resolvedByRole": user["role"], "resolvedByUserId": user["user_id"],
                        "resolvedByName": user["display_name"], "resolvedAt": timestamp,
                    })
                    database.execute("UPDATE safety_flags SET status='resolved',payload=?,resolved_at=? WHERE flag_id=?", (json.dumps(payload, ensure_ascii=False), timestamp, row["flag_id"]))
                append_audit(database, user, "SAFETY_FLAGS_RESOLVED", "child", child_id, {"count": len(rows), "resolutionNote": resolution_note, "followupPlan": followup_plan})
            self.json_response(200, {"resolved": True, "count": len(rows)})
            return
        self.require("safety:flag")
        user = self.authenticated_user()
        self.require_child_access(child_id)
        flag = data.get("flag") if isinstance(data.get("flag"), dict) else data
        flag_id = str(flag.get("id") or flag.get("flagId") or "")
        if not flag_id:
            raise ValueError("风险记录缺少编号")
        severity = str(flag.get("severity", ""))
        note, resume_criteria = str(flag.get("note", "")).strip(), str(flag.get("resumeCriteria", "")).strip()
        if severity not in {"urgent", "high", "moderate"} or not note or not resume_criteria:
            raise ValueError("风险记录必须包含有效等级、观察处置和恢复训练前置条件")
        flag.update({
            "id": flag_id, "childId": child_id, "status": "active",
            "createdByRole": user["role"], "createdByUserId": user["user_id"], "createdByName": user["display_name"],
        })
        with connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO safety_flags(flag_id,child_id,status,payload,created_at,resolved_at) VALUES(?,?,'active',?,?,NULL)",
                (flag_id, child_id, json.dumps(flag, ensure_ascii=False), utc_now()),
            )
            append_audit(database, user, "SAFETY_FLAG_CREATED", "safety_flag", flag_id, {"childId": child_id, "severity": severity, "type": flag.get("type")})
        self.json_response(201, {"saved": True, "flagId": flag_id})

    def delete_child(self, child_id: str) -> None:
        self.require("child:delete")
        self.require_child_access(child_id)
        with connect() as database:
            if not database.execute("SELECT 1 FROM children WHERE child_id=?", (child_id,)).fetchone():
                raise ValueError("儿童档案不存在")
            database.execute("DELETE FROM personalized_question_sets WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM profile_evidence WHERE run_id IN (SELECT run_id FROM profile_agent_runs WHERE child_id=?)", (child_id,))
            database.execute("DELETE FROM profile_agent_runs WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM ai_inferences WHERE profile_id IN (SELECT profile_id FROM ability_profiles WHERE child_id=?)", (child_id,))
            database.execute("DELETE FROM ability_profiles WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM assessments WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM intervention_logs WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM care_records WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM safety_flags WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM training_records WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM user_child_bindings WHERE child_id=?", (child_id,))
            database.execute("DELETE FROM children WHERE child_id=?", (child_id,))
        self.json_response(200, {"deleted": True, "childId": child_id})
    def create_import_batch(self, files: list[tuple[str, bytes]]) -> None:
        role = self.require("import:create")
        batch_id = "BAT-" + uuid.uuid4().hex
        from import_pipeline import start_batch_process, store_uploaded_document
        timestamp = utc_now()
        with connect() as database:
            database.execute("INSERT INTO import_batches(batch_id,created_by_role,status,total_documents,processed_documents,created_at,updated_at) VALUES(?,?, 'queued', ?,0,?,?)", (batch_id, role, len(files), timestamp, timestamp))
        accepted, duplicates = 0, []
        for filename, payload in files:
            _document_id, duplicate = store_uploaded_document(DATABASE_FILE, batch_id, filename, payload)
            if duplicate: duplicates.append(filename)
            else: accepted += 1
        with connect() as database:
            database.execute("UPDATE import_batches SET total_documents=?,updated_at=? WHERE batch_id=?", (accepted, utc_now(), batch_id))
            database.execute("INSERT INTO audit_logs(audit_id,actor_role,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)", ("AUD-"+uuid.uuid4().hex, role, "IMPORT_BATCH_CREATED", "import_batch", batch_id, json.dumps({"accepted": accepted, "duplicates": len(duplicates)}, ensure_ascii=False), utc_now()))
        if accepted:
            start_batch_process(DATABASE_FILE, batch_id, connect)
        else:
            with connect() as database:
                database.execute("UPDATE import_batches SET status='review',updated_at=? WHERE batch_id=?", (utc_now(), batch_id))
        self.json_response(202, {"batchId": batch_id, "accepted": accepted, "duplicates": duplicates})

    def review_import_field(self, data: dict) -> None:
        role = self.require("import:review")
        field_id = str(data.get("fieldId", "")); decision = str(data.get("decision", ""))
        if decision not in {"approved", "rejected"}:
            raise ValueError("复核决定必须是批准或拒绝")
        reviewed_value = str(data.get("value", "")).strip()
        with connect() as database:
            row = database.execute("SELECT document_id,extracted_value FROM extracted_fields WHERE field_id=?", (field_id,)).fetchone()
            if not row: raise ValueError("字段不存在")
            if decision == "approved" and not reviewed_value: reviewed_value = row["extracted_value"]
            database.execute("UPDATE extracted_fields SET review_status=?,reviewed_value=?,reviewed_by=?,reviewed_at=? WHERE field_id=?", (decision, reviewed_value, role, utc_now(), field_id))
            document = database.execute("SELECT batch_id FROM source_documents WHERE document_id=?", (row["document_id"],)).fetchone()
            database.execute("INSERT INTO import_reviews(review_id,batch_id,document_id,reviewer_role,action,payload,created_at) VALUES(?,?,?,?,?,?,?)", ("REV-"+uuid.uuid4().hex, document["batch_id"], row["document_id"], role, "FIELD_"+decision.upper(), json.dumps({"fieldId": field_id}, ensure_ascii=False), utc_now()))
        self.json_response(200, {"saved": True, "fieldId": field_id})

    def commit_import(self, data: dict) -> None:
        role = self.require("import:commit")
        batch_id, child_id = str(data.get("batchId", "")), str(data.get("childId", ""))
        if not batch_id or not child_id: raise ValueError("请选择批次和目标儿童")
        self.require_child_access(child_id)
        scores = data.get("scores") or {}
        if scores: scores = valid_scores(scores)
        with connect() as database:
            pending = database.execute("SELECT COUNT(*) n FROM extracted_fields WHERE review_status='pending' AND document_id IN (SELECT document_id FROM source_documents WHERE batch_id=?)", (batch_id,)).fetchone()["n"]
            if pending: raise ValueError(f"仍有 {pending} 个字段未复核")
            fields = database.execute("SELECT field_key,field_label,reviewed_value,document_id,page_number,confidence FROM extracted_fields WHERE review_status='approved' AND document_id IN (SELECT document_id FROM source_documents WHERE batch_id=?)", (batch_id,)).fetchall()
            evidence = [dict(row) for row in fields]
            record_id = "CARE-IMPORT-" + uuid.uuid4().hex
            payload = {"id": record_id, "childId": child_id, "kind": "intake", "version": 1, "status": "imported", "sourceBatchId": batch_id, "verifiedFields": evidence, "importedAt": utc_now(), "importedBy": role}
            database.execute("INSERT INTO care_records(record_id,child_id,kind,version,status,payload,created_at) VALUES(?,?,?,?,?,?,?)", (record_id, child_id, "intake", 1, "imported", json.dumps(payload, ensure_ascii=False), utc_now()))
            tools = sorted({row["reviewed_value"] for row in fields if row["field_key"] == "assessment.tool"})
            for tool in tools:
                assessment_id = "ASM-IMPORT-" + uuid.uuid4().hex
                assessment = {"assessmentId": assessment_id, "childId": child_id, "toolCode": tool, "sourceBatchId": batch_id, "status": "historical-import-verified"}
                database.execute("INSERT INTO assessments(assessment_id,child_id,tool_code,payload,created_at) VALUES(?,?,?,?,?)", (assessment_id, child_id, tool, json.dumps(assessment, ensure_ascii=False), utc_now()))
            profile_id = None
            if scores:
                profile_id = "PRO-IMPORT-" + uuid.uuid4().hex
                profile = {"profileId": profile_id, "childId": child_id, "scores": scores, "confidence": .65, "source": "verified-scanned-records", "sourceBatchId": batch_id, "evidence": evidence, "reviewRequired": True}
                database.execute("UPDATE ability_profiles SET status='history' WHERE child_id=? AND status='current'", (child_id,))
                database.execute("INSERT INTO ability_profiles(profile_id,child_id,status,confidence,payload,created_at) VALUES(?,?, 'current',.65,?,?)", (profile_id, child_id, json.dumps(profile, ensure_ascii=False), utc_now()))
            database.execute("UPDATE import_batches SET status='imported',updated_at=? WHERE batch_id=?", (utc_now(), batch_id))
            database.execute("INSERT INTO audit_logs(audit_id,actor_role,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)", ("AUD-"+uuid.uuid4().hex, role, "IMPORT_COMMITTED", "import_batch", batch_id, json.dumps({"childId": child_id, "approvedFields": len(fields), "profileId": profile_id}, ensure_ascii=False), utc_now()))
        self.json_response(201, {"imported": True, "recordId": record_id, "profileId": profile_id, "approvedFields": len(fields)})

    def run_profile_agent(self, data: dict) -> None:
        """读取本机OCR密文，生成带逐页证据的草稿画像和题目集。"""
        role = self.require("agent:run")
        batch_id, child_id = str(data.get("batchId", "")), str(data.get("childId", ""))
        if not batch_id or not child_id:
            raise ValueError("请选择识别批次和目标儿童")
        self.require_child_access(child_id)
        from import_pipeline import decrypt_text
        from profile_agent import analyze
        with connect() as database:
            rows = database.execute("SELECT p.document_id,p.page_number,p.page_type,p.ocr_confidence,p.encrypted_ocr FROM document_pages p JOIN source_documents d ON d.document_id=p.document_id WHERE d.batch_id=? ORDER BY p.document_id,p.page_number", (batch_id,)).fetchall()
        if not rows:
            raise ValueError("该批次尚无OCR结果，请等待识别完成")
        pages = [{"documentId": row["document_id"], "page": row["page_number"], "pageType": row["page_type"], "confidence": row["ocr_confidence"], "text": decrypt_text(row["encrypted_ocr"])} for row in rows]
        result = analyze(pages, batch_id, child_id)
        with connect() as database:
            database.execute("INSERT INTO profile_agent_runs(run_id,batch_id,child_id,status,provider,model,confidence,profile_payload,solution_payload,created_at) VALUES(?,?,?,'draft',?,?,?,?,?,?)", (result["runId"], batch_id, child_id, result["provider"], result["model"], result["profile"]["confidence"], json.dumps(result["profile"], ensure_ascii=False), json.dumps(result["solution"], ensure_ascii=False), utc_now()))
            for item in result["evidence"]:
                database.execute("INSERT INTO profile_evidence(evidence_id,run_id,document_id,page_number,domain,direction,prompt_level,confidence,evidence_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (item["evidenceId"], result["runId"], item["documentId"], item["page"], item["domain"], item["direction"], item["promptLevel"], item["confidence"], item["text"], utc_now()))
            set_id = "QSET-" + uuid.uuid4().hex
            question_set = {**result["solution"], "questionSetId": set_id, "runId": result["runId"], "childId": child_id, "version": 1}
            database.execute("INSERT INTO personalized_question_sets(question_set_id,run_id,child_id,status,version,payload,created_at) VALUES(?,?,?,'draft',1,?,?)", (set_id, result["runId"], child_id, json.dumps(question_set, ensure_ascii=False), utc_now()))
            database.execute("INSERT INTO audit_logs(audit_id,actor_role,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)", ("AUD-"+uuid.uuid4().hex, role, "PROFILE_AGENT_DRAFT_CREATED", "agent_run", result["runId"], json.dumps({"batchId": batch_id, "childId": child_id, "evidenceCount": len(result["evidence"])}, ensure_ascii=False), utc_now()))
        # 返回画像和题目参数，不返回全部OCR正文；证据只包含命中的短句。
        self.json_response(201, result)

    def approve_profile_agent(self, data: dict) -> None:
        """专业人员可调整等级；审核后才激活画像和儿童题目。"""
        role = self.require("agent:review")
        run_id = str(data.get("runId", "")); overrides = data.get("levels") or {}
        with connect() as database:
            row = database.execute("SELECT * FROM profile_agent_runs WHERE run_id=? AND status='draft'", (run_id,)).fetchone()
            if not row:
                raise ValueError("未找到待审核的Agent结果")
            self.require_child_access(row["child_id"])
            profile = json.loads(row["profile_payload"]); old_solution = json.loads(row["solution_payload"])
            from profile_agent import build_solution
            for domain in profile.get("domains", []):
                if domain["domain"] in overrides:
                    level = int(overrides[domain["domain"]])
                    if level < 0 or level > 4: raise ValueError("画像等级必须在L0-L4之间")
                    domain["level"] = level; domain["score"] = {0: None, 1: 28, 2: 46, 3: 66, 4: 84}[level]
                    domain["professionalOverride"] = True
            solution = build_solution(profile["domains"], profile.get("riskFlags", []))
            profile["status"] = "approved"; profile["reviewedBy"] = role; profile["reviewedAt"] = utc_now()
            scores = {item["domain"]: item["score"] for item in profile["domains"] if item["score"] is not None}
            if not scores:
                raise ValueError("至少需要确认一个有证据的能力领域")
            database.execute("UPDATE ability_profiles SET status='history' WHERE child_id=? AND status='current'", (row["child_id"],))
            database.execute("INSERT OR REPLACE INTO ability_profiles(profile_id,child_id,status,confidence,payload,created_at) VALUES(?,?, 'current',?,?,?)", (profile["profileId"], row["child_id"], profile["confidence"], json.dumps({**profile, "scores": scores}, ensure_ascii=False), utc_now()))
            database.execute("UPDATE personalized_question_sets SET status='history' WHERE child_id=? AND status='effective'", (row["child_id"],))
            set_row = database.execute("SELECT question_set_id,version FROM personalized_question_sets WHERE run_id=?", (run_id,)).fetchone()
            question_set = {**solution, "questionSetId": set_row["question_set_id"], "runId": run_id, "childId": row["child_id"], "version": set_row["version"], "status": "effective"}
            database.execute("UPDATE personalized_question_sets SET status='effective',payload=? WHERE run_id=?", (json.dumps(question_set, ensure_ascii=False), run_id))
            database.execute("UPDATE profile_agent_runs SET status='approved',profile_payload=?,solution_payload=?,reviewed_by=?,reviewed_at=? WHERE run_id=?", (json.dumps(profile, ensure_ascii=False), json.dumps(solution, ensure_ascii=False), role, utc_now(), run_id))
            database.execute("INSERT INTO audit_logs(audit_id,actor_role,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)", ("AUD-"+uuid.uuid4().hex, role, "PROFILE_AGENT_APPROVED", "agent_run", run_id, json.dumps({"childId": row["child_id"], "levels": overrides}, ensure_ascii=False), utc_now()))
        self.json_response(201, {"approved": True, "profileId": profile["profileId"], "questionSetId": set_row["question_set_id"], "questionCount": len(solution["questions"])})

    def save_profile(self, data: dict) -> None:
        self.require("profile:create")
        profile = data.get("profile") or {}
        inference = data.get("inference") or {}
        profile_id, child_id = str(profile.get("profileId", "")), str(profile.get("childId", ""))
        if not profile_id or not child_id:
            raise ValueError("缺少画像编号或儿童编号")
        self.require_child_access(child_id)
        profile["scores"] = valid_scores(profile.get("scores"))
        with connect() as database:
            database.execute("UPDATE ability_profiles SET status='history' WHERE child_id=? AND status='current'", (child_id,))
            database.execute(
                "INSERT OR REPLACE INTO ability_profiles(profile_id,child_id,status,confidence,payload,created_at) VALUES(?,?,?,?,?,?)",
                (profile_id, child_id, "current", float(profile.get("confidence", 0)), json.dumps(profile, ensure_ascii=False), utc_now()),
            )
            if inference:
                database.execute(
                    "INSERT OR REPLACE INTO ai_inferences(inference_id,profile_id,provider,model,payload,created_at) VALUES(?,?,?,?,?,?)",
                    (str(inference.get("inferenceId", "")), profile_id, str(inference.get("provider", "")), str(inference.get("model", "")), json.dumps(inference, ensure_ascii=False), utc_now()),
                )
        self.json_response(201, {"saved": True, "database": str(DATABASE_FILE.name), "profileId": profile_id})

    def save_assessment(self, data: dict) -> None:
        user = self.authenticated_user()
        role = user["role"]
        family_observation = data.get("source") == "family" or data.get("toolCode") == "FAMILY_OBSERVATION"
        platform_baseline = data.get("source") == "platform" and data.get("toolCode") == "platform-baseline-v1"
        self.require("observation:create" if family_observation else "profile:create" if platform_baseline else "assessment:create")
        assessment_id = str(data.get("assessmentId", ""))
        child_id, tool_code = str(data.get("childId", "")), str(data.get("toolCode", ""))
        if not assessment_id or not child_id:
            raise ValueError("缺少评估编号或儿童编号")
        self.require_child_access(child_id)
        allowed_domains = ASSESSMENT_TOOL_DOMAINS.get(tool_code)
        if not allowed_domains:
            raise ValueError("未知评估工具")
        scores = valid_scores(data.get("domainScores"))
        if any(domain not in allowed_domains for domain in scores):
            raise ValueError("评估结果包含该工具不支持的领域")
        assessed_at = data.get("assessedAt", data.get("ts"))
        if isinstance(assessed_at, str):
            try:
                assessed_at = datetime.fromisoformat(assessed_at.replace("Z", "+00:00")).timestamp() * 1000
            except ValueError as error:
                raise ValueError("评估日期格式无效") from error
        if not isinstance(assessed_at, (int, float)) or assessed_at <= 0:
            raise ValueError("评估日期无效")
        if assessed_at > datetime.now(timezone.utc).timestamp() * 1000 + 60_000:
            raise ValueError("评估日期不能晚于当前时间")
        if not family_observation and not platform_baseline:
            tool_version = str(data.get("toolVersion", "")).strip()
            score_basis = str(data.get("scoreBasis", "")).strip()
            if not tool_version or not score_basis:
                raise ValueError("专业评估必须包含工具版本和原始分换算依据")
            data["toolVersion"], data["scoreBasis"] = tool_version, score_basis
            data["evaluator"], data["evaluatorUserId"] = user["display_name"], user["user_id"]
        data["assessedAt"], data["domainScores"], data["recordedByRole"] = round(assessed_at), scores, role
        with connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO assessments(assessment_id,child_id,tool_code,payload,created_at) VALUES(?,?,?,?,?)",
                (assessment_id, child_id, tool_code, json.dumps(data, ensure_ascii=False), utc_now()),
            )
            append_audit(database, user, "ASSESSMENT_SAVED", "assessment", assessment_id, {"childId": child_id, "toolCode": tool_code, "source": data.get("source")})
        self.json_response(201, {"saved": True, "assessmentId": assessment_id})

    def save_intervention(self, data: dict) -> None:
        self.require("intervention:create")
        record_id, child_id = str(data.get("id", "")), str(data.get("childId", ""))
        if not record_id or not child_id or not data.get("methodId"):
            raise ValueError("缺少活动、儿童或康复方法编号")
        self.require_child_access(child_id)
        data["minutes"] = max(1, min(60, int(data.get("minutes", 5))))
        with connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO intervention_logs(record_id,child_id,method_id,payload,created_at) VALUES(?,?,?,?,?)",
                (record_id, child_id, str(data["methodId"]), json.dumps(data, ensure_ascii=False), utc_now()),
            )
        self.json_response(201, {"saved": True, "recordId": record_id})

    def save_care_record(self, data: dict) -> None:
        """保存接案、目标、方案版本、复评或结案记录。

        这些记录统一使用不可变 payload 留痕；更新时由前端产生新版本编号，
        避免覆盖历史签署内容。家长只能提交确认记录，不能写专业结论。
        """
        kind = str(data.get("kind", ""))
        allowed_kinds = {"intake", "goal", "plan", "reevaluation", "closure", "followup", "confirmation"}
        if kind not in allowed_kinds:
            raise ValueError("未知专业记录类型")
        self.require("care:confirm" if kind == "confirmation" else "care:write")
        user = self.authenticated_user()
        record_id, child_id = str(data.get("id", "")), str(data.get("childId", ""))
        if not record_id or not child_id:
            raise ValueError("缺少记录编号或儿童编号")
        self.require_child_access(child_id)
        signed_record = (kind == "plan" and data.get("status") == "effective") or (kind == "closure" and data.get("status") == "signed")
        if signed_record:
            self.require("care:sign")
            if not data.get("signature", {}).get("intentConfirmed"):
                raise ValueError("签署记录必须包含当前专业人员的明确确认")
            credential = PROFESSIONAL_CREDENTIALS.get(user["user_id"], {})
            data["signature"] = {
                "signedBy": user["display_name"], "signerUserId": user["user_id"], "role": user["role"],
                "credentialId": credential.get("credentialId"), "professionalTitle": credential.get("title"),
                "organization": credential.get("organization"), "credentialStatus": credential.get("status"),
                "signedAt": utc_now(), "authentication": "server-session",
            }
            data["signedBy"] = user["display_name"]
        with connect() as database:
            existing = database.execute("SELECT payload FROM care_records WHERE record_id=?", (record_id,)).fetchone()
            if signed_record and existing:
                stored = json.loads(existing["payload"])
                self.json_response(200, {"saved": True, "recordId": record_id, "kind": kind, "record": stored, "idempotent": True})
                return
            if signed_record and kind == "plan":
                rows = database.execute("SELECT record_id,payload FROM care_records WHERE child_id=? AND kind='plan' AND status='effective'", (child_id,)).fetchall()
                for row in rows:
                    payload = json.loads(row["payload"])
                    payload["status"], payload["supersededAt"] = "superseded", utc_now()
                    database.execute("UPDATE care_records SET status='superseded',payload=? WHERE record_id=?", (json.dumps(payload, ensure_ascii=False), row["record_id"]))
            statement = "INSERT INTO care_records(record_id,child_id,kind,version,status,payload,created_at) VALUES(?,?,?,?,?,?,?)" if signed_record else "INSERT OR REPLACE INTO care_records(record_id,child_id,kind,version,status,payload,created_at) VALUES(?,?,?,?,?,?,?)"
            database.execute(statement, (record_id, child_id, kind, int(data.get("version", 1)), str(data.get("status", "active")), json.dumps(data, ensure_ascii=False), utc_now()))
            append_audit(database, user, "CARE_RECORD_SIGNED" if signed_record else "CARE_RECORD_SAVED", "care_record", record_id, {"childId": child_id, "kind": kind, "version": data.get("version"), "status": data.get("status")})
        self.json_response(201, {"saved": True, "recordId": record_id, "kind": kind, "record": data})

    def generate_profile_text(self, data: dict) -> None:
        self.require("ai:generate")
        scores = valid_scores(data.get("scores"))
        # 仅发送匿名六域聚合结果；服务端拒绝和忽略姓名、诊断及逐题记录。
        prompt = "六域训练起点分数：" + json.dumps(scores, ensure_ascii=False) + "。写一句60字以内、非诊断、非标签化、适合儿童的鼓励语。"
        request = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps({"model": OLLAMA_MODEL, "stream": False, "think": False, "messages": [
                {"role": "system", "content": "你是儿童训练平台安全文案助手。不得诊断、比较、承诺疗效或使用贬损词。"},
                {"role": "user", "content": prompt},
            ]}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                result = json.loads(response.read())
            text = str(result.get("message", {}).get("content", "")).strip()[:100]
            if not text:
                raise ValueError("模型未返回文本")
            self.json_response(200, {"provider": "ollama-local", "model": OLLAMA_MODEL, "text": text})
        except (urllib.error.URLError, TimeoutError, ValueError):
            self.json_response(503, {"error": "本机 Ollama 未启动，前端将使用安全离线文案"})


if __name__ == "__main__":
    initialise_database()
    # 启动时恢复上次因关机/关闭终端而中断的识别任务；已完成页面不会重复识别。
    from import_pipeline import start_batch_process
    with connect() as database:
        recoverable = database.execute(
            "SELECT batch_id FROM import_batches WHERE status IN ('queued','processing') ORDER BY created_at"
        ).fetchall()
    for row in recoverable:
        start_batch_process(DATABASE_FILE, row["batch_id"], connect)
    requested_port = int(os.environ.get("QIZHI_PORT", "8876"))
    server = None
    # Windows 上仅依赖 bind 可能因端口复用误判成功；先主动连接确认该端口
    # 是否已经由别的项目监听，防止浏览器实际打开 Django 等其他服务。
    for port in ([requested_port] if "QIZHI_PORT" in os.environ else range(requested_port, requested_port + 10)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                continue
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), ApiHandler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit(f"{requested_port}-{requested_port + 9} 端口均被占用，请设置 QIZHI_PORT 后重试")
    print(f"启智训练台：http://127.0.0.1:{server.server_port}\nSQLite：{DATABASE_FILE}")
    server.serve_forever()

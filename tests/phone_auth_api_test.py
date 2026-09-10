"""验证手机号主键、首次管理员初始化、密码登录与数据库权限边界。"""
import json
import sqlite3
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import server  # noqa: E402


def request(base, path, payload=None, token=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + path, data=body, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


with tempfile.TemporaryDirectory() as folder:
    server.DATABASE_FILE = Path(folder) / "phone-auth.db"
    server.BACKUP_DIR = Path(folder) / "backups"
    server.initialise_database()
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.ApiHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}"

    status, health = request(base, "/api/health")
    assert status == 200 and health["accountSetupRequired"] is True
    status, _ = request(base, "/api/auth/login", {"role": "admin", "pin": "8888"})
    assert status == 403
    status, invalid_phone = request(base, "/api/auth/bootstrap-admin", {"phone": "138abc00138000", "displayName": "系统管理员", "password": "Admin2026!"})
    assert status == 400 and "手机号码" in invalid_phone["error"]
    status, weak = request(base, "/api/auth/bootstrap-admin", {"phone": "13800138000", "displayName": "系统管理员", "password": "12345678"})
    assert status == 400 and "字母和数字" in weak["error"]
    status, created = request(base, "/api/auth/bootstrap-admin", {"phone": "+86 138-0013-8000", "displayName": "系统管理员", "password": "Admin2026!"})
    assert status == 201 and created["created"] is True
    status, _ = request(base, "/api/auth/bootstrap-admin", {"phone": "13900139000", "displayName": "第二管理员", "password": "Admin2027!"})
    assert status == 403
    status, login = request(base, "/api/auth/login", {"phone": "13800138000", "password": "Admin2026!"})
    assert status == 200 and login["user"]["userId"] == "13800138000" and login["user"]["role"] == "admin"
    admin_token = login["token"]

    status, denied = request(base, "/api/children", {"child": {"id": "forbidden"}}, admin_token)
    assert status == 403 and "无权" in denied["error"]
    account = {"action": "create", "phone": "13900139000", "role": "parent", "displayName": "正式家长", "newPassword": "Parent2026!", "confirmationPassword": "Admin2026!"}
    status, result = request(base, "/api/admin/accounts", account, admin_token)
    assert status == 200 and result["saved"] is True
    status, parent_login = request(base, "/api/auth/login", {"phone": "13900139000", "password": "Parent2026!"})
    assert status == 200 and parent_login["user"]["role"] == "parent"
    status, denied = request(base, "/api/admin/accounts", {**account, "phone": "13700137000", "confirmationPassword": "wrong-password"}, admin_token)
    assert status == 403 and "二次确认失败" in denied["error"]

    database = sqlite3.connect(server.DATABASE_FILE)
    try:
        phone_column = next(row for row in database.execute("PRAGMA table_xinfo(app_users)") if row[1] == "phone")
        assert phone_column[5] == 1
        assert database.execute("SELECT COUNT(*) FROM app_users WHERE user_id LIKE 'user_%'").fetchone()[0] == 0
        assert database.execute("SELECT COUNT(*) FROM role_permissions").fetchone()[0] == sum(len(value) for value in server.ROLE_ACTIONS.values())
        assert database.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        database.close()
    httpd.shutdown(); httpd.server_close()

print("Phone auth passed: phone primary key, first-admin setup, password login, re-authentication and database permissions.")

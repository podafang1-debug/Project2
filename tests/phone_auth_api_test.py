"""验证家庭共享账号、三角色登录、专业账号审核与患者选择。"""
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
    assert status == 200 and health["accountSetupRequired"] is False
    status, invalid_role = request(base, "/api/auth/login", {"role": "admin", "phone": "13600000001", "password": "Teacher2026!"})
    assert status == 403 and "请选择" in invalid_role["error"]
    status, direct_child = request(base, "/api/auth/register", {"role": "child", "displayName": "新儿童", "birthYear": 2019, "phone": "13100131001", "password": "ChildNew2026!"})
    assert status == 400
    status, parent_registered = request(base, "/api/auth/register", {"role": "parent", "displayName": "新家长", "childDisplayName": "小朋友", "birthYear": 2020, "phone": "13200132001", "password": "ParentNew2026!"})
    assert status == 201 and parent_registered["status"] == "active"
    status, no_role = request(base, "/api/auth/login", {"phone": "13200132001", "password": "ParentNew2026!"})
    assert status == 403 and "请选择" in no_role["error"]
    status, parent_self_login = request(base, "/api/auth/login", {"role": "parent", "phone": "13200132001", "password": "ParentNew2026!"})
    assert status == 200 and parent_self_login["user"]["role"] == "parent" and len(parent_self_login["authorizedChildIds"]) == 1
    child_id = parent_self_login["authorizedChildIds"][0]
    status, child_login = request(base, "/api/auth/login", {"role": "child", "phone": "13200132001", "password": "ParentNew2026!"})
    assert status == 200 and child_login["user"]["role"] == "child" and child_login["authorizedChildIds"] == [child_id]
    status, wrong_entry = request(base, "/api/auth/login", {"role": "teacher", "phone": "13200132001", "password": "ParentNew2026!"})
    assert status == 403 and "所选角色" in wrong_entry["error"]
    status, teacher_registered = request(base, "/api/auth/register", {"role": "teacher", "displayName": "待审核专业人员", "phone": "13400134001", "password": "TeacherNew2026!"})
    assert status == 201 and teacher_registered["status"] == "pending"
    status, _ = request(base, "/api/auth/login", {"role": "teacher", "phone": "13400134001", "password": "TeacherNew2026!"})
    assert status == 403
    status, professional_login = request(base, "/api/auth/login", {"role": "teacher", "phone": "13600000001", "password": "Teacher2026!"})
    assert status == 200 and professional_login["user"]["role"] == "teacher"
    professional_token = professional_login["token"]
    status, enabled = request(base, "/api/admin/accounts", {"action": "set-status", "phone": "13400134001", "status": "active", "confirmationPassword": "Teacher2026!"}, professional_token)
    assert status == 200 and enabled["saved"]
    status, teacher_login = request(base, "/api/auth/login", {"role": "teacher", "phone": "13400134001", "password": "TeacherNew2026!"})
    assert status == 200 and teacher_login["user"]["role"] == "teacher" and teacher_login["authorizedChildIds"] == []
    teacher_token = teacher_login["token"]
    status, patients = request(base, "/api/patients", token=teacher_token)
    assert status == 200 and any(item["childId"] == child_id and not item["selected"] for item in patients["patients"])
    status, selected = request(base, "/api/patients", {"childIds": [child_id]}, teacher_token)
    assert status == 200 and selected["authorizedChildIds"] == [child_id]
    status, bootstrap = request(base, "/api/bootstrap", token=teacher_token)
    assert status == 200 and bootstrap["authorizedChildIds"] == [child_id] and len(bootstrap["children"]) == 1
    status, denied = request(base, "/api/admin/accounts", {"action": "set-status", "phone": "13400134001", "status": "active", "confirmationPassword": "wrong-password"}, professional_token)
    assert status == 403 and "二次确认失败" in denied["error"]

    database = sqlite3.connect(server.DATABASE_FILE)
    try:
        phone_column = next(row for row in database.execute("PRAGMA table_xinfo(app_users)") if row[1] == "phone")
        assert phone_column[5] == 1
        assert database.execute("SELECT COUNT(*) FROM app_users WHERE user_id LIKE 'user_%'").fetchone()[0] == 0
        assert {row[0] for row in database.execute("SELECT role_code FROM roles")} == {"child", "parent", "teacher"}
        assert database.execute("SELECT COUNT(*) FROM app_users WHERE role='admin'").fetchone()[0] == 0
        family_roles = {row[0] for row in database.execute("SELECT role_code FROM account_roles WHERE user_id='13200132001'")}
        assert family_roles == {"child", "parent"}
        assert database.execute("SELECT COUNT(*) FROM role_permissions").fetchone()[0] == sum(len(value) for value in server.ROLE_ACTIONS.values())
        assert database.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        database.close()
    httpd.shutdown(); httpd.server_close()

print("Phone auth passed: shared family account, role entry, professional approval and patient selection.")

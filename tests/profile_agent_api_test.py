"""使用临时数据库验证 Agent 接口、审批和儿童题目读取权限。"""
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("QIZHI_SEED_DEMO_ACCOUNTS", "1")
import server  # noqa: E402
from import_pipeline import encrypt_text  # noqa: E402


def request(base, path, payload=None, token=None, extra_headers=None):
    body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json", **(extra_headers or {})}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + path, data=body, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


with tempfile.TemporaryDirectory() as folder:
    server.DATABASE_FILE = Path(folder) / "agent-test.db"
    server.BACKUP_DIR = Path(folder) / "backups"
    server.initialise_database()
    now = server.utc_now()
    with server.connect() as database:
        database.execute("INSERT INTO import_batches VALUES('BAT-T','teacher','review',1,1,NULL,?,?)", (now, now))
        database.execute("INSERT INTO source_documents VALUES('DOC-T','BAT-T','test.pdf','hash-t','none.enc',1,'review',?)", (now,))
        database.execute("INSERT INTO document_pages VALUES('PAGE-T','DOC-T',1,'summary',0,.9,?,?)", (encrypt_text("能够理解简单指令，但两步指令需要手势提示。注意力容易分心。能够独立进食。"), now))
        child = {"id": "CHILD-T", "name": "测试儿童", "status": "在训", "createdAt": now}
        database.execute("INSERT INTO children VALUES(?,?,?,?,?)", ("CHILD-T", "在训", json.dumps(child, ensure_ascii=False), now, now))
        database.executemany("INSERT INTO user_child_bindings VALUES(?,?,?,'test','active',?,NULL)", [("bind-teacher-t", "13600000001", "CHILD-T", now[:10]), ("bind-parent-t", "13700000002", "CHILD-T", now[:10])])
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.ApiHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}"
    _, teacher_login = request(base, "/api/auth/login", {"role": "teacher", "phone": "13600000001", "password": "Teacher2026!"}); teacher_token = teacher_login["token"]
    _, parent_login = request(base, "/api/auth/login", {"role": "parent", "phone": "13700000002", "password": "Parent2026!"}); parent_token = parent_login["token"]
    _, child_login = request(base, "/api/auth/login", {"role": "child", "phone": "13700000002", "password": "Parent2026!"}); child_token = child_login["token"]
    admin_token = teacher_token
    status, summary = request(base, "/api/bootstrap", token=admin_token)
    assert status == 200 and "CHILD-T" in summary["authorizedChildIds"] and any(child["id"] == "CHILD-T" for child in summary["children"])
    status, operations = request(base, "/api/admin/operations", token=admin_token)
    assert status == 200 and operations["children"] >= 2 and "usersByRole" in operations
    status, missing_confirmation = request(base, "/api/admin/content", {"action": "save-draft"}, admin_token)
    assert status == 403 and "二次确认" in missing_confirmation["error"]
    content_payload = {"code": "ADM-T01", "title": "管理端测试内容", "category": "训练活动", "difficulty": 2, "locale": "普通话/通用场景", "body": "依据目标完成两步训练。", "culturalReview": "已检查表达和场景适配。", "copyrightSource": "机构原创", "safetyNote": "明显不适时停止。", "changeNote": "建立首个测试版本。"}
    status, draft_content = request(base, "/api/admin/content", {"action": "save-draft", "content": content_payload, "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 201
    status, direct_publish = request(base, "/api/admin/content", {"action": "publish", "versionId": draft_content["versionId"], "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 400 and "审核通过" in direct_publish["error"]
    status, approved_content = request(base, "/api/admin/content", {"action": "approve", "versionId": draft_content["versionId"], "reason": "来源、安全和适配项完整。", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and approved_content["status"] == "approved"
    status, published_content = request(base, "/api/admin/content", {"action": "publish", "versionId": draft_content["versionId"], "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and published_content["status"] == "published"
    status, consent_saved = request(base, "/api/consents", {"childId": "CHILD-T", "scope": ["training", "assessment"]}, parent_token)
    assert status == 201 and consent_saved["saved"]
    status, data_request = request(base, "/api/data-requests", {"childId": "CHILD-T", "type": "deletion"}, parent_token)
    assert status == 201 and data_request["saved"]
    status, governance = request(base, "/api/admin/governance", token=admin_token)
    assert status == 200 and governance["consents"]["active"] == 1 and governance["requests"][0]["childRef"].startswith("CHILD-")
    status, request_updated = request(base, "/api/admin/governance", {"requestId": data_request["requestId"], "status": "processing", "resolutionNote": "已转交数据治理人员核验。", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and request_updated["saved"]
    status, org_created = request(base, "/api/admin/organizations", {"action": "create-organization", "name": "测试协作机构", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and org_created["saved"]
    status, share_created = request(base, "/api/admin/sharing", {"action": "create", "targetOrganization": "测试协作机构", "scope": ["training-summary"], "validTo": "2099-12-31", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and share_created["saved"]
    status, backup_created = request(base, "/api/admin/backups", {"action": "create", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 201 and backup_created["sizeBytes"] > 0
    status, backup_verified = request(base, "/api/admin/backups", {"action": "verify", "backupId": backup_created["backupId"], "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and backup_verified["status"] == "verified"
    status, audit = request(base, "/api/admin/audit", token=admin_token)
    assert status == 200 and audit["redacted"] and audit["items"] and all("detail" not in item and item["targetRef"].startswith("TARGET-") for item in audit["items"])
    status, accounts = request(base, "/api/admin/accounts", token=admin_token)
    assert status == 200 and accounts["children"] and all(set(child) == {"childRef"} for child in accounts["children"])
    status, account_created = request(base, "/api/admin/accounts", {"action": "create", "phone": "13500000005", "role": "parent", "displayName": "第二家长测试账号", "newPassword": "SecondParent2026!", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and account_created["saved"]
    status, updated_accounts = request(base, "/api/admin/accounts", token=admin_token)
    new_parent = next(user for user in updated_accounts["users"] if user["display_name"] == "第二家长测试账号")
    status, binding_saved = request(base, "/api/admin/accounts", {"action": "binding-upsert", "phone": new_parent["phone"], "childRef": updated_accounts["children"][0]["childRef"], "scope": "guardian", "validTo": "2099-12-31", "confirmationPassword": "Teacher2026!"}, admin_token)
    assert status == 200 and binding_saved["saved"]
    assessment_meta = {"toolVersion":"测试授权版","scoreBasis":"原始分按测试换算规则映射"}
    status, bad_domain = request(base, "/api/assessments", {"assessmentId":"BAD-DOMAIN","childId":"CHILD-T","toolCode":"VINELAND","domainScores":{"A":50},"assessedAt":time.time()*1000,"source":"professional",**assessment_meta}, teacher_token)
    assert status == 400 and "不支持" in bad_domain["error"]
    status, future = request(base, "/api/assessments", {"assessmentId":"FUTURE","childId":"CHILD-T","toolCode":"VINELAND","domainScores":{"D":50},"assessedAt":time.time()*1000+86400000,"source":"professional",**assessment_meta}, teacher_token)
    assert status == 400 and "不能晚于" in future["error"]
    status, valid_assessment = request(base, "/api/assessments", {"assessmentId":"VALID","childId":"CHILD-T","toolCode":"VINELAND","domainScores":{"D":62,"E":58},"assessedAt":time.time()*1000,"source":"professional",**assessment_meta}, teacher_token)
    assert status == 201 and valid_assessment["saved"]
    risk_flag = {
        "id": "RISK-T", "childId": "CHILD-T", "type": "seizure", "label": "疑似癫痫发作",
        "severity": "high", "onsetAt": time.time() * 1000, "note": "训练中出现短暂意识丧失，已停止训练并联系监护人。",
        "resumeCriteria": "经线下医疗评估并由实名专业人员复核后方可恢复。", "status": "active"
    }
    status, created_risk = request(base, "/api/safety-flags", {"childId": "CHILD-T", "flag": risk_flag}, teacher_token)
    assert status == 201 and created_risk["saved"]
    status, incomplete_resolution = request(base, "/api/safety-flags", {"childId": "CHILD-T", "action": "resolve", "resolution": {"confirmed": True}}, teacher_token)
    assert status == 400 and "解除依据" in incomplete_resolution["error"]
    resolution = {"resolutionNote": "已完成线下评估，当前未见继续暂停线上训练的指征。", "followupPlan": "首周降低训练强度并每日记录异常表现。", "confirmed": True}
    status, resolved_risk = request(base, "/api/safety-flags", {"childId": "CHILD-T", "action": "resolve", "resolution": resolution}, teacher_token)
    assert status == 200 and resolved_risk["resolved"] == 1

    status, forged = request(base, "/api/agent/analyze", {"batchId": "BAT-T", "childId": "CHILD-T"}, extra_headers={"X-Role": "teacher"})
    assert status == 403 and "会话" in forged["error"]
    status, draft = request(base, "/api/agent/analyze", {"batchId": "BAT-T", "childId": "CHILD-T"}, teacher_token)
    assert status == 201 and len(draft["solution"]["questions"]) == 66
    status, denied = request(base, "/api/agent/analyze", {"batchId": "BAT-T", "childId": "CHILD-T"}, parent_token)
    assert status == 403 and "无权" in denied["error"]
    status, approved = request(base, "/api/agent/approve", {"runId": draft["runId"], "levels": {"A": 1, "D": 2, "F": 3}}, teacher_token)
    assert status == 201 and approved["questionCount"] == 66
    status, questions = request(base, "/api/personalized/questions?child_id=CHILD-T", token=child_token)
    status, curriculum = request(base, "/api/personalized/levels?child_id=CHILD-T&excluded=audio%2Cspoken", token=child_token)
    assert status == 200 and len(curriculum["curriculum"]["levels"]) == 20
    assert all(len(level["activities"]) == 5 for level in curriculum["curriculum"]["levels"])
    assert all(activity["type"] not in {"audio", "spoken"} for level in curriculum["curriculum"]["levels"] for activity in level["activities"])
    assert curriculum["curriculum"]["extension"]["nextLevelOrder"] == 21
    assert status == 200 and questions["questionSet"]["status"] == "effective"
    status, cross_child = request(base, "/api/personalized/questions?child_id=c2", token=child_token)
    assert status == 403 and "授权" in cross_child["error"]
    assert all(item["target"] in item["choices"] for item in questions["questionSet"]["questions"])
    assert all(len([item for item in questions["questionSet"]["questions"] if item["moduleId"] == module_id]) == 3 for module_id in {item["moduleId"] for item in questions["questionSet"]["questions"]})
    assert all(item["preview"] for item in questions["questionSet"]["questions"] if item["mode"] == "memory")
    for _ in range(5):
        status, _ = request(base, "/api/auth/login", {"role": "parent", "phone": "13700000002", "password": "Wrong2026!"})
        assert status == 403
    status, locked_login = request(base, "/api/auth/login", {"role": "parent", "phone": "13700000002", "password": "Parent2026!"})
    assert status == 403 and "稍后" in locked_login["error"]
    httpd.shutdown(); httpd.server_close(); time.sleep(.3)

print("API passed: professional governance, login lockout, assessment provenance, risk closure and child access.")

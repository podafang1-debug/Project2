"""使用临时数据库验证 Agent 接口、审批和儿童题目读取权限。"""
import json
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
import server  # noqa: E402
from import_pipeline import encrypt_text  # noqa: E402


def request(base, path, role, payload=None):
    body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(base + path, data=body, headers={"X-Role": role, "Content-Type": "application/json"}, method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


with tempfile.TemporaryDirectory() as folder:
    server.DATABASE_FILE = Path(folder) / "agent-test.db"
    server.initialise_database()
    now = server.utc_now()
    with server.connect() as database:
        database.execute("INSERT INTO import_batches VALUES('BAT-T','teacher','review',1,1,NULL,?,?)", (now, now))
        database.execute("INSERT INTO source_documents VALUES('DOC-T','BAT-T','test.pdf','hash-t','none.enc',1,'review',?)", (now,))
        database.execute("INSERT INTO document_pages VALUES('PAGE-T','DOC-T',1,'summary',0,.9,?,?)", (encrypt_text("能够理解简单指令，但两步指令需要手势提示。注意力容易分心。能够独立进食。"), now))
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.ApiHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}"
    status, draft = request(base, "/api/agent/analyze", "teacher", {"batchId": "BAT-T", "childId": "CHILD-T"})
    assert status == 201 and len(draft["solution"]["questions"]) == 22
    status, denied = request(base, "/api/agent/analyze", "parent", {"batchId": "BAT-T", "childId": "CHILD-T"})
    assert status == 403 and "无权" in denied["error"]
    status, approved = request(base, "/api/agent/approve", "teacher", {"runId": draft["runId"], "levels": {"A": 1, "D": 2, "F": 3}})
    assert status == 201 and approved["questionCount"] == 22
    status, questions = request(base, "/api/personalized/questions?child_id=CHILD-T", "child")
    assert status == 200 and questions["questionSet"]["status"] == "effective"
    assert all(item["target"] in item["choices"] for item in questions["questionSet"]["questions"])
    httpd.shutdown(); httpd.server_close(); time.sleep(.3)

print("Profile agent API passed: draft, role denial, approval and effective child questions.")

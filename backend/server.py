"""启智训练台本地后端。

只使用 Python 标准库即可运行：
1. 提供静态网站；2. 用 SQLite 持久保存画像和评估；
3. 在服务端执行角色权限检查；4. 安全代理本机 Ollama 免费模型。

启动：python backend/server.py
访问：http://127.0.0.1:8765
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_FILE = Path(__file__).resolve().parent / "training_platform.db"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen3:0.6b"
DOMAINS = {"A", "B", "C", "D", "E", "F"}

# 后端权限是最终边界，前端菜单隐藏仅用于改善体验。
ROLE_ACTIONS = {
    "child": {"profile:create", "profile:read", "ai:generate", "questions:read"},
    "parent": {"profile:read", "observation:create", "intervention:create", "care:confirm", "questions:read"},
    "teacher": {"profile:create", "profile:read", "assessment:create", "ai:generate", "intervention:create", "care:write", "care:sign", "import:create", "import:read", "import:review", "import:commit", "agent:run", "agent:review", "questions:read"},
    "admin": {"profile:summary", "content:review", "content:publish", "organization:manage", "audit:read", "backup:manage", "import:summary"},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    database = sqlite3.connect(DATABASE_FILE)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA foreign_keys = ON")
    return database


def initialise_database() -> None:
    schema = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    with connect() as database:
        database.executescript(schema)


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

    def require(self, action: str) -> str:
        role = self.headers.get("X-Role", "")
        if action not in ROLE_ACTIONS.get(role, set()):
            raise PermissionError(f"角色 {role or 'unknown'} 无权执行 {action}")
        return role

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.json_response(200, {"ok": True, "storage": "sqlite", "aiModel": OLLAMA_MODEL})
            return
        if parsed.path == "/api/profiles/current":
            try:
                self.require("profile:read")
                child_id = parse_qs(parsed.query).get("child_id", [""])[0]
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
                role = self.headers.get("X-Role", "")
                self.require("import:read" if role == "teacher" else "import:summary")
                with connect() as database:
                    rows = database.execute("SELECT batch_id,status,total_documents,processed_documents,error_message,created_at,updated_at FROM import_batches ORDER BY created_at DESC LIMIT 30").fetchall()
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
                    documents = database.execute("SELECT document_id,original_name,page_count,status FROM source_documents WHERE batch_id=? ORDER BY created_at", (batch_id,)).fetchall()
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
                with connect() as database:
                    row = database.execute("SELECT * FROM profile_agent_runs WHERE child_id=? ORDER BY created_at DESC LIMIT 1", (child_id,)).fetchone()
                if not row:
                    self.json_response(200, {"run": None}); return
                run = dict(row); run["profile"] = json.loads(run.pop("profile_payload")); run["solution"] = json.loads(run.pop("solution_payload"))
                self.json_response(200, {"run": run})
            except PermissionError as error:
                self.json_response(403, {"error": str(error)})
            return
        if parsed.path == "/api/personalized/questions":
            try:
                self.require("questions:read")
                query = parse_qs(parsed.query); child_id = query.get("child_id", [""])[0]; module_id = query.get("module_id", [""])[0]
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
            if path == "/api/imports/batches":
                self.create_import_batch(self.read_pdf_uploads()); return
            routes = {
                "/api/profiles": self.save_profile,
                "/api/assessments": self.save_assessment,
                "/api/interventions": self.save_intervention,
                "/api/care-records": self.save_care_record,
                "/api/ai/profile": self.generate_profile_text,
                "/api/imports/review": self.review_import_field,
                "/api/imports/commit": self.commit_import,
                "/api/agent/analyze": self.run_profile_agent,
                "/api/agent/approve": self.approve_profile_agent,
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

    def create_import_batch(self, files: list[tuple[str, bytes]]) -> None:
        role = self.require("import:create")
        batch_id = "BAT-" + uuid.uuid4().hex
        from import_pipeline import start_batch_thread, store_uploaded_document
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
            start_batch_thread(DATABASE_FILE, batch_id, connect)
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
        self.require("assessment:create")
        assessment_id = str(data.get("assessmentId", ""))
        child_id = str(data.get("childId", ""))
        if not assessment_id or not child_id:
            raise ValueError("缺少评估编号或儿童编号")
        data["domainScores"] = valid_scores(data.get("domainScores"))
        with connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO assessments(assessment_id,child_id,tool_code,payload,created_at) VALUES(?,?,?,?,?)",
                (assessment_id, child_id, str(data.get("toolCode", "")), json.dumps(data, ensure_ascii=False), utc_now()),
            )
        self.json_response(201, {"saved": True, "assessmentId": assessment_id})

    def save_intervention(self, data: dict) -> None:
        self.require("intervention:create")
        record_id, child_id = str(data.get("id", "")), str(data.get("childId", ""))
        if not record_id or not child_id or not data.get("methodId"):
            raise ValueError("缺少活动、儿童或康复方法编号")
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
        record_id, child_id = str(data.get("id", "")), str(data.get("childId", ""))
        if not record_id or not child_id:
            raise ValueError("缺少记录编号或儿童编号")
        if kind == "plan" and data.get("status") == "effective":
            self.require("care:sign")
            if not data.get("signature", {}).get("signedBy"):
                raise ValueError("生效方案必须包含专业签署")
        with connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO care_records(record_id,child_id,kind,version,status,payload,created_at) VALUES(?,?,?,?,?,?,?)",
                (record_id, child_id, kind, int(data.get("version", 1)), str(data.get("status", "active")), json.dumps(data, ensure_ascii=False), utc_now()),
            )
        self.json_response(201, {"saved": True, "recordId": record_id, "kind": kind})

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
    requested_port = int(os.environ.get("QIZHI_PORT", "8765"))
    server = None
    # 8765 是本项目的固定默认端口；若偶尔被占用，则自动寻找相邻可用端口。
    for port in ([requested_port] if "QIZHI_PORT" in os.environ else range(requested_port, requested_port + 10)):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), ApiHandler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit("8765-8774 端口均被占用，请设置 QIZHI_PORT 后重试")
    print(f"启智训练台：http://127.0.0.1:{server.server_port}\nSQLite：{DATABASE_FILE}")
    server.serve_forever()

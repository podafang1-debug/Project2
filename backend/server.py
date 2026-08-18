"""启智训练台本地后端。

只使用 Python 标准库即可运行：
1. 提供静态网站；2. 用 SQLite 持久保存画像和评估；
3. 在服务端执行角色权限检查；4. 安全代理本机 Ollama 免费模型。

启动：python backend/server.py
访问：http://127.0.0.1:8000
"""
from __future__ import annotations

import json
import sqlite3
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
    "child": {"profile:create", "profile:read", "ai:generate"},
    "parent": {"profile:read", "observation:create", "intervention:create", "care:confirm"},
    "teacher": {"profile:create", "profile:read", "assessment:create", "ai:generate", "intervention:create", "care:write", "care:sign"},
    "admin": {"profile:summary", "content:review", "content:publish", "organization:manage", "audit:read", "backup:manage"},
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
        if parsed.path.startswith("/api/"):
            self.json_response(404, {"error": "接口不存在"})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        try:
            routes = {
                "/api/profiles": self.save_profile,
                "/api/assessments": self.save_assessment,
                "/api/interventions": self.save_intervention,
                "/api/care-records": self.save_care_record,
                "/api/ai/profile": self.generate_profile_text,
            }
            handler = routes.get(urlparse(self.path).path)
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
    print(f"启智训练台：http://127.0.0.1:8000\nSQLite：{DATABASE_FILE}")
    ThreadingHTTPServer(("127.0.0.1", 8000), ApiHandler).serve_forever()

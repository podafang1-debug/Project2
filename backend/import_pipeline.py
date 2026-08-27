"""本地扫描档案导入：加密原件、离线OCR、候选字段和证据追溯。"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pymupdf as fitz
import numpy as np
from cryptography.fernet import Fernet
from rapidocr_onnxruntime import RapidOCR

BASE_DIR = Path(__file__).resolve().parent
PRIVATE_DIR = BASE_DIR / "private_documents"
KEY_FILE = BASE_DIR / ".document_key"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


def cipher() -> Fernet:
    """密钥仅保存在本机且被版本控制忽略；生产环境应改用机构密钥管理系统。"""
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    if not KEY_FILE.exists():
        KEY_FILE.write_bytes(Fernet.generate_key())
    return Fernet(KEY_FILE.read_bytes().strip())


def encrypt_bytes(data: bytes) -> bytes:
    return cipher().encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    return cipher().decrypt(data)


def encrypt_text(text: str) -> str:
    return encrypt_bytes(text.encode("utf-8")).decode("ascii")


def decrypt_text(token: str) -> str:
    return decrypt_bytes(token.encode("ascii")).decode("utf-8")


PAGE_TYPES = {
    "intake": ("基本情况", "基本信息", "发育史", "家庭情况", "诊断"),
    "assessment": ("评估", "测评", "量表", "能力评定", "评定记录"),
    "plan": ("训练计划", "康复计划", "年度计划", "训练目标"),
    "session": ("训练记录", "效果反馈", "家校联系", "完成情况"),
    "attendance": ("考勤", "签到", "出勤"),
    "summary": ("康复总结", "训练总结", "阶段总结", "建议"),
    "agreement": ("协议", "知情同意", "服务合同"),
}
TOOL_NAMES = ("Gesell", "Griffiths", "WISC", "C-WISC", "DDST", "文兰", "VABS", "S-S", "PEP-3", "VB-MAPP", "ABLLS-R", "ABC", "CARS", "社会生活能力量表")
RISK_WORDS = ("癫痫", "自伤", "攻击", "吞咽困难", "跌倒风险", "严重情绪爆发")


def classify_page(text: str) -> str:
    scores = {kind: sum(text.count(word) for word in words) for kind, words in PAGE_TYPES.items()}
    kind, score = max(scores.items(), key=lambda item: item[1])
    return kind if score else "other"


def context(text: str, needle: str, radius: int = 45) -> str:
    index = text.lower().find(needle.lower())
    if index < 0:
        return ""
    return re.sub(r"\s+", " ", text[max(0, index-radius):index+len(needle)+radius]).strip()


def candidate(key: str, label: str, value: str, confidence: float, sensitivity: str, page: int, snippet: str) -> dict:
    return {"field_id": new_id("FLD"), "field_key": key, "field_label": label,
            "value": value.strip(), "confidence": round(float(confidence), 3),
            "sensitivity": sensitivity, "page": page,
            "evidence": {"page": page, "snippet": snippet[:180]}}


def extract_candidates(text: str, page: int, mean_confidence: float) -> list[dict]:
    """保守提取明确标签；缺失值保持为空，绝不由AI猜测。"""
    values: list[dict] = []
    compact = re.sub(r"[ \t]+", " ", text)
    patterns = (
        ("child.alias", "儿童姓名/化名", r"(?:姓名|儿童姓名)\s*[：:]\s*([^\s，,。]{2,8})", "identity"),
        ("child.birth_date", "出生日期", r"出生(?:日期|年月)?\s*[：:]?\s*(\d{4}[年./-]\d{1,2}[月./-]\d{1,2}日?)", "identity"),
        ("child.diagnosis", "诊断", r"(?:诊断|主要诊断)\s*[：:]\s*([^\n]{2,40})", "health"),
        ("child.disability_level", "障碍程度", r"(?:障碍程度|残疾等级)\s*[：:]\s*([^\n]{1,20})", "health"),
        ("child.language_level", "语言水平", r"语言(?:能力|水平)\s*[：:]\s*([^\n]{1,35})", "health"),
        ("child.adl_level", "生活自理/ADL", r"(?:生活自理|ADL)\s*[：:]\s*([^\n]{1,35})", "health"),
    )
    for key, label, pattern, sensitivity in patterns:
        for match in re.finditer(pattern, compact, flags=re.I):
            raw = match.group(1).strip(" ：:;；")
            if raw:
                values.append(candidate(key, label, raw, mean_confidence * .88, sensitivity, page, match.group(0)))
    for tool in TOOL_NAMES:
        if tool.lower() in compact.lower():
            values.append(candidate("assessment.tool", "评估工具", tool, mean_confidence * .92, "health", page, context(compact, tool)))
    for risk in RISK_WORDS:
        if risk in compact:
            values.append(candidate("risk.flag", "风险/禁忌候选", risk, mean_confidence * .85, "health", page, context(compact, risk)))
    return values


class LocalOCR:
    def __init__(self) -> None:
        self.engine = RapidOCR()

    def read_page(self, page: fitz.Page) -> tuple[str, float, int]:
        rotation = int(page.rotation or 0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2.25, 2.25), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        result, _elapsed = self.engine(image)
        if not result:
            return "", 0.0, rotation
        lines, confidences = [], []
        for row in result:
            if len(row) >= 3:
                lines.append(str(row[1])); confidences.append(float(row[2]))
        return "\n".join(lines), sum(confidences) / len(confidences) if confidences else 0.0, rotation


def store_uploaded_document(database_file: Path, batch_id: str, filename: str, data: bytes) -> tuple[str, bool]:
    digest = hashlib.sha256(data).hexdigest()
    with sqlite3.connect(database_file) as db:
        duplicate = db.execute("SELECT document_id FROM source_documents WHERE sha256=?", (digest,)).fetchone()
        if duplicate:
            return str(duplicate[0]), True
        document_id = new_id("DOC")
        batch_dir = PRIVATE_DIR / batch_id
        batch_dir.mkdir(parents=True, exist_ok=True)
        encrypted_path = batch_dir / f"{document_id}.pdf.enc"
        encrypted_path.write_bytes(encrypt_bytes(data))
        db.execute("INSERT INTO source_documents(document_id,batch_id,original_name,sha256,encrypted_path,status,created_at) VALUES(?,?,?,?,?,'queued',?)",
                   (document_id, batch_id, Path(filename).name, digest, str(encrypted_path.relative_to(BASE_DIR)), now()))
    return document_id, False


def process_batch(database_file: Path, batch_id: str, connect: Callable[[], sqlite3.Connection]) -> None:
    try:
        with connect() as db:
            db.execute("UPDATE import_batches SET status='processing',updated_at=? WHERE batch_id=?", (now(), batch_id))
            documents = db.execute("SELECT * FROM source_documents WHERE batch_id=? AND status='queued'", (batch_id,)).fetchall()
        ocr = LocalOCR()
        for document in documents:
            encrypted_path = BASE_DIR / document["encrypted_path"]
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp:
                temp_path = Path(temp.name); temp.write(decrypt_bytes(encrypted_path.read_bytes()))
            try:
                pdf = fitz.open(temp_path)
                with connect() as db:
                    db.execute("UPDATE source_documents SET page_count=?,status='processing' WHERE document_id=?", (len(pdf), document["document_id"]))
                for index, page in enumerate(pdf):
                    page_no = index + 1
                    text, confidence, orientation = ocr.read_page(page)
                    with connect() as db:
                        db.execute("INSERT OR REPLACE INTO document_pages(page_id,document_id,page_number,page_type,orientation,ocr_confidence,encrypted_ocr,created_at) VALUES(?,?,?,?,?,?,?,?)",
                                   (new_id("PAG"), document["document_id"], page_no, classify_page(text), orientation, confidence, encrypt_text(text), now()))
                        for item in extract_candidates(text, page_no, confidence):
                            db.execute("INSERT INTO extracted_fields(field_id,document_id,page_number,field_key,field_label,extracted_value,confidence,sensitivity,review_status,evidence_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                       (item["field_id"], document["document_id"], page_no, item["field_key"], item["field_label"], item["value"], item["confidence"], item["sensitivity"], "pending", json.dumps(item["evidence"], ensure_ascii=False), now()))
                pdf.close()
                with connect() as db:
                    db.execute("UPDATE source_documents SET status='review' WHERE document_id=?", (document["document_id"],))
                    db.execute("UPDATE import_batches SET processed_documents=processed_documents+1,updated_at=? WHERE batch_id=?", (now(), batch_id))
            finally:
                temp_path.unlink(missing_ok=True)
        with connect() as db:
            db.execute("UPDATE import_batches SET status='review',updated_at=? WHERE batch_id=?", (now(), batch_id))
    except Exception as error:
        with connect() as db:
            db.execute("UPDATE import_batches SET status='failed',error_message=?,updated_at=? WHERE batch_id=?", (str(error)[:500], now(), batch_id))


def start_batch_thread(database_file: Path, batch_id: str, connect: Callable[[], sqlite3.Connection]) -> None:
    threading.Thread(target=process_batch, args=(database_file, batch_id, connect), daemon=True, name=f"import-{batch_id}").start()

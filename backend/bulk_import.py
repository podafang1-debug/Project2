"""将文件夹中的 PDF 批量加入本地识别队列。

用法：python backend/bulk_import.py "E:\\待导入档案" --recursive
字段复核和正式入档仍须在专业端网页完成。
"""
from __future__ import annotations

import argparse
import uuid
from pathlib import Path

from import_pipeline import now, process_batch, store_uploaded_document
from server import DATABASE_FILE, connect, initialise_database


def main() -> None:
    parser = argparse.ArgumentParser(description="批量导入扫描PDF到启智训练台")
    parser.add_argument("folder", type=Path, help="包含PDF的目录")
    parser.add_argument("--recursive", action="store_true", help="同时扫描子目录")
    args = parser.parse_args()
    folder = args.folder.resolve()
    if not folder.is_dir():
        raise SystemExit(f"目录不存在：{folder}")
    initialise_database()
    files = sorted(folder.rglob("*.pdf") if args.recursive else folder.glob("*.pdf"))
    if not files:
        raise SystemExit("目录中没有PDF文件")
    batch_id = "BAT-" + uuid.uuid4().hex
    timestamp = now()
    with connect() as database:
        database.execute("INSERT INTO import_batches(batch_id,created_by_role,status,total_documents,processed_documents,created_at,updated_at) VALUES(?, 'teacher', 'queued', ?,0,?,?)", (batch_id, len(files), timestamp, timestamp))
    accepted = duplicates = 0
    for path in files:
        _document_id, duplicate = store_uploaded_document(DATABASE_FILE, batch_id, path.name, path.read_bytes())
        duplicates += int(duplicate); accepted += int(not duplicate)
        print(f"[{'跳过重复' if duplicate else '已加密入队'}] {path.name}")
    with connect() as database:
        database.execute("UPDATE import_batches SET total_documents=?,updated_at=? WHERE batch_id=?", (accepted, now(), batch_id))
    if accepted:
        print(f"批次 {batch_id}：{accepted} 份开始离线识别，{duplicates} 份重复。")
        process_batch(DATABASE_FILE, batch_id, connect)
        print("识别完成。请在专业端进行字段复核。")
    else:
        with connect() as database:
            database.execute("UPDATE import_batches SET status='review',updated_at=? WHERE batch_id=?", (now(), batch_id))
        print("所有文件均已导入过，无需重复处理。")


if __name__ == "__main__":
    main()

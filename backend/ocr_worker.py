"""隔离运行单个 OCR 批次，避免原生识别引擎影响网页服务。"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from import_pipeline import process_batch


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--batch", required=True)
    args = parser.parse_args()
    database_file = args.database.resolve()

    def connect() -> sqlite3.Connection:
        database = sqlite3.connect(database_file, factory=ClosingConnection, timeout=30)
        database.row_factory = sqlite3.Row
        database.execute("PRAGMA foreign_keys = ON")
        return database

    process_batch(database_file, args.batch, connect)


if __name__ == "__main__":
    main()

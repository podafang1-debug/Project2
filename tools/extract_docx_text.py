"""按文档顺序提取 Word 中的段落和表格，供需求核对使用。"""

from pathlib import Path
from sys import argv, stdout
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_blocks(document):
    """按 XML 顺序返回正文中的段落与表格，避免表格内容被遗漏。"""
    for child in document.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, document)
        elif child.tag.endswith("}tbl"):
            yield Table(child, document)


stdout.reconfigure(encoding="utf-8")

for filename in argv[1:]:
    path = Path(filename)
    print(f"\n{'=' * 24} {path.name} {'=' * 24}")
    document = Document(path)
    for index, block in enumerate(iter_blocks(document), start=1):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text:
                style = block.style.name if block.style else ""
                print(f"P{index:04d} [{style}] {text}")
        else:
            print(f"T{index:04d} [TABLE {len(block.rows)}x{len(block.columns)}]")
            for row in block.rows:
                cells = [" / ".join(p.text.strip() for p in cell.paragraphs if p.text.strip()) for cell in row.cells]
                print("  | " + " | ".join(cells) + " |")

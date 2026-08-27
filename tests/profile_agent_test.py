"""档案画像 Agent 的安全、证据和题目可作答性回归测试。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from profile_agent import analyze  # noqa: E402

pages = [{
    "documentId": "DOC-TEST", "page": 12, "pageType": "summary", "confidence": .9,
    "text": "能够理解简单指令，但完成两步指令时需要手势提示。注意力容易分心。能够独立进食。无癫痫史。",
}]
result = analyze(pages, "BAT-TEST", "CHILD-TEST")
domains = {item["domain"]: item for item in result["profile"]["domains"]}

assert domains["D"]["contradiction"], "语言领域应同时保留优势和支持需求"
assert domains["A"]["level"] <= 2, "注意困难不应被解释为高能力"
assert domains["B"]["level"] == 0, "无记忆证据时必须是资料不足"
assert not result["solution"]["riskFlags"], "‘无癫痫史’不能触发风险暂停"
assert len(result["solution"]["modulePlans"]) == 22
assert len(result["solution"]["questions"]) == 22
for question in result["solution"]["questions"]:
    assert question["target"] in question["choices"], f"题目不可作答：{question['moduleId']}"
    assert 1 <= len(question["choices"]) <= 4
    assert question["prompt"] and question["encouragement"] and question["errorFeedback"]

print("Profile agent passed: evidence levels, negated risk, 22 plans and playable questions.")

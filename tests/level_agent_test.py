"""验证 20 关课程 Agent 的渐进、偏好和隐私约束。"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from level_agent import MODULES, build_context, build_curriculum  # noqa: E402

profile = {"scores": {"A": 22, "B": 35, "C": 48, "D": 58, "E": 72, "F": 82}}
child = {
    "id": "CHILD-SECRET", "name": "不可发送的姓名", "diagnosis": "不可发送的诊断",
    "birthYear": 2019, "languageLevel": "短句", "adlLevel": "少量支持",
}
records = [
    {"source": "baseline-game", "domain": domain, "correct": index % 2 == 0}
    for domain in "ABCDEF" for index in range(4)
]
curriculum = build_curriculum(profile, child, [], records, ["audio", "spoken"])
levels = curriculum["levels"]

assert len(levels) == 20
assert [level["order"] for level in levels] == list(range(1, 21))
assert [level["levelId"] for level in levels] == [f"LV{i:02d}" for i in range(1, 21)]
assert all(len(level["activities"]) == 5 for level in levels)
assert all(activity["moduleId"] in MODULES for level in levels for activity in level["activities"])
assert all(activity["type"] not in {"audio", "spoken"} for level in levels for activity in level["activities"])
assert all(level["passRule"] == {"minCompleted": 5, "minAccuracy": .6} for level in levels)
difficulties = [level["difficulty"] for level in levels]
assert difficulties == sorted(difficulties) and difficulties[0] >= 1 and difficulties[-1] <= 5
assert curriculum["extension"]["nextLevelOrder"] == 21

anonymous = build_context(profile, child, [], records).anonymized()
serialized = str(anonymous)
assert child["name"] not in serialized and child["id"] not in serialized and child["diagnosis"] not in serialized
print("Level Agent passed: 20 progressive levels, five activities, exclusions, extension and de-identification.")

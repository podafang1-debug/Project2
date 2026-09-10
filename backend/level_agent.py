"""儿童端 20 关课程编排 Agent。

默认使用可复现的本地规则；显式启用 CrewAI 时，可调用本地 Ollama 或已配置的外部
模型。传给模型的内容只包含去标识化能力特征，任何无效输出都会回退到本地方案。
"""
from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

DOMAINS = ("A", "B", "C", "D", "E", "F")
DOMAIN_NAMES = {"A": "观察力", "B": "记忆力", "C": "想办法", "D": "说与听", "E": "一起玩", "F": "生活小能手"}
MODULES: dict[str, tuple[str, str, str]] = {
    "P01": ("颜色侦探", "A", "color"), "P02": ("形状乐园", "A", "shape"),
    "P03": ("找不同", "A", "choice"), "P04": ("听声寻宝", "A", "audio"),
    "M01": ("物品配对", "B", "matching"), "M02": ("记忆宝盒", "B", "memory"),
    "M03": ("顺序小火车", "B", "sequence"), "M04": ("工作记忆", "B", "memory"),
    "E01": ("生活因果", "C", "choice"), "E02": ("分类篮", "C", "sorting"),
    "E03": ("数量星球", "C", "choice"), "E04": ("步骤拼图", "C", "sequence"),
    "L01": ("看图说词", "D", "spoken"), "L02": ("看图说话", "D", "spoken"),
    "L03": ("听懂任务", "D", "audio"), "L04": ("图片表达", "D", "choice"),
    "S01": ("表情猜猜", "E", "choice"), "S02": ("轮流游戏", "E", "guided"),
    "S03": ("社交选择", "E", "choice"), "D01": ("生活步骤", "F", "sequence"),
    "D02": ("轻轻点选", "F", "tap"), "D03": ("节奏模仿", "F", "guided"),
}
SUPPORTED_ACTIVITY_TYPES = tuple(sorted({item[2] for item in MODULES.values()}))


@dataclass(frozen=True)
class CurriculumContext:
    scores: dict[str, float]
    age_band: str
    language_level: str
    adl_level: str
    baseline_answers: int
    recent_accuracy: dict[str, float]
    excluded_types: tuple[str, ...]

    def anonymized(self) -> dict[str, Any]:
        """可发送给模型的最小特征；不含姓名、编号、诊断和档案原文。"""
        return {
            "scores": self.scores, "ageBand": self.age_band,
            "languageSupport": self.language_level, "dailyLivingSupport": self.adl_level,
            "baselineAnswerCount": self.baseline_answers,
            "recentAccuracyByDomain": self.recent_accuracy,
            "excludedActivityTypes": list(self.excluded_types),
        }


def _number(value: Any, default: float = 50) -> float:
    try:
        return max(0, min(100, float(value)))
    except (TypeError, ValueError):
        return default


def _age_band(child: dict[str, Any]) -> str:
    try:
        age = datetime.now().year - int(child.get("birthYear"))
    except (TypeError, ValueError):
        return "unknown"
    return "preschool" if age <= 5 else "early-primary" if age <= 8 else "primary" if age <= 12 else "adolescent"

def _support_band(value: Any) -> str:
    text = str(value or "")
    if not text or text == "未填写":
        return "not-recorded"
    for keyword, label in (("独立", "independent"), ("无需", "independent"), ("少量", "light-support"),
                           ("短句", "phrase"), ("单词", "single-word"), ("提示", "prompt-support"),
                           ("较多", "substantial-support"), ("完全", "full-support")):
        if keyword in text:
            return label
    return "recorded-unspecified"


def build_context(profile: dict | None, child: dict | None, assessments: list[dict],
                  training_records: list[dict], excluded_types: list[str] | None = None) -> CurriculumContext:
    child = child or {}
    source_scores = (profile or {}).get("scores") or child.get("profile6") or {}
    scores = {domain: _number(source_scores.get(domain)) for domain in DOMAINS}
    recent_accuracy: dict[str, float] = {}
    for domain in DOMAINS:
        items = [item for item in training_records if item.get("domain") == domain and item.get("source") != "baseline-game"][-12:]
        recent_accuracy[domain] = round(sum(bool(item.get("firstCorrect", item.get("correct"))) for item in items) / len(items), 3) if items else 0.5
    baseline_answers = sum(item.get("source") == "baseline-game" for item in training_records)
    exclusions = tuple(sorted({item for item in (excluded_types or []) if item in SUPPORTED_ACTIVITY_TYPES}))
    return CurriculumContext(
        scores=scores, age_band=_age_band(child),
        language_level=_support_band(child.get("languageLevel")),
        adl_level=_support_band(child.get("adlLevel")),
        baseline_answers=baseline_answers, recent_accuracy=recent_accuracy,
        excluded_types=exclusions,
    )


def _domain_order(context: CurriculumContext) -> list[str]:
    return sorted(DOMAINS, key=lambda domain: (
        context.scores[domain] * .7 + context.recent_accuracy[domain] * 30, DOMAINS.index(domain)
    ))


def _module_candidates(domains: list[str], excluded: set[str]) -> list[str]:
    preferred = [key for key, (_, domain, kind) in MODULES.items() if domain in domains and kind not in excluded]
    fallback = [key for key, (_, _domain, kind) in MODULES.items() if kind not in excluded]
    return preferred + [key for key in fallback if key not in preferred]


def _local_curriculum(context: CurriculumContext) -> dict[str, Any]:
    order, excluded = _domain_order(context), set(context.excluded_types)
    titles = [
        "出发啦", "眼睛小侦探", "记忆宝盒", "听听看", "第一座彩虹桥",
        "配对高手", "顺序小火车", "生活小帮手", "表情朋友", "第二座彩虹桥",
        "分类探险", "指令挑战", "说说看", "轮流合作", "第三座彩虹桥",
        "计划小达人", "工作记忆站", "生活闯关", "综合大冒险", "彩虹岛庆典",
    ]
    levels: list[dict[str, Any]] = []
    for index in range(20):
        stage = index // 5 + 1
        focus = [order[(index + offset) % len(order)] for offset in (0, 1, 3)]
        candidates = _module_candidates(focus, excluded) or ["P01", "P02", "P03", "L04", "D02"]
        chosen: list[str] = []
        used_types: set[str] = set()
        cursor, guard = index * 3, 0
        while len(chosen) < 5 and guard < len(candidates) * 4:
            module_id = candidates[cursor % len(candidates)]
            kind = MODULES[module_id][2]
            if module_id not in chosen and (kind not in used_types or len(chosen) >= 3):
                chosen.append(module_id); used_types.add(kind)
            cursor += 1; guard += 1
        for item in candidates:
            if len(chosen) == 5:
                break
            if item not in chosen:
                chosen.append(item)
        while len(chosen) < 5:
            chosen.append(candidates[len(chosen) % len(candidates)])
        activities = []
        for activity_index, module_id in enumerate(chosen[:5]):
            name, domain, kind = MODULES[module_id]
            activities.append({
                "activityId": f"LV{index + 1:02d}-A{activity_index + 1}",
                "moduleId": module_id, "domain": domain, "type": kind,
                "label": name, "questionVariant": (index + activity_index) % 3,
            })
        base = sum(context.scores[domain] for domain in focus) / len(focus)
        difficulty = max(1, min(5, stage + (-1 if base < 35 else 1 if base >= 75 else 0)))
        difficulty = max(levels[-1]["difficulty"] if levels else 1, difficulty)
        levels.append({
            "levelId": f"LV{index + 1:02d}", "order": index + 1,
            "title": titles[index], "theme": f"{DOMAIN_NAMES[focus[0]]}岛",
            "difficulty": difficulty, "focusDomains": focus, "activities": activities,
            "passRule": {"minCompleted": 5, "minAccuracy": .6},
        })
    return {
        "curriculumId": "CUR-" + uuid.uuid4().hex, "version": 1,
        "status": "effective-presentation-plan",
        "generatedBy": {"provider": "local-curriculum-agent", "model": "rules-v1", "fallback": False},
        "personalization": context.anonymized(), "levels": levels,
        "extension": {
            "schemaVersion": "level-plan-v1", "nextLevelOrder": 21,
            "endpoint": "/api/personalized/levels", "templateRegistry": "backend.level_agent.MODULES",
        },
        "notice": "关卡编排基于训练起点与近期表现，不是诊断或标准化测评结论。",
    }


def _valid_model_result(result: Any, context: CurriculumContext) -> bool:
    excluded = set(context.excluded_types)
    return isinstance(result, dict) and len(result.get("levels", [])) == 20 and all(
        isinstance(level.get("activities"), list) and len(level["activities"]) >= 3
        and 1 <= int(level.get("difficulty", 0)) <= 5 for level in result["levels"]
        and all(activity.get("moduleId") in MODULES for activity in level["activities"])
        and all(activity.get("type") not in excluded for activity in level["activities"])
    )


def _crewai_curriculum(context: CurriculumContext, fallback: dict[str, Any]) -> dict[str, Any] | None:
    if os.getenv("LEVEL_AGENT_CREWAI", "0") != "1":
        return None
    try:
        from crewai import Agent, Crew, LLM, Process, Task  # type: ignore
    except ImportError:
        return None
    model = os.getenv("LEVEL_AGENT_MODEL", "ollama/qwen3:4b")
    kwargs: dict[str, Any] = {"model": model, "temperature": 0.2}
    if os.getenv("LEVEL_AGENT_BASE_URL"):
        kwargs["base_url"] = os.environ["LEVEL_AGENT_BASE_URL"]
    agent = Agent(
        role="儿童认知训练课程编排员",
        goal="在不改变审核题目内容的前提下，编排渐进、多形式且尊重儿童选择的20关课程",
        backstory="只处理去标识化训练特征，禁止诊断，禁止添加不存在的训练模块。",
        llm=LLM(**kwargs), verbose=False, allow_delegation=False,
    )
    prompt = {
        "anonymousFeatures": context.anonymized(), "allowedModules": MODULES,
        "requiredSchema": "level-plan-v1; exactly 20 levels; at least 3 activities per level",
        "safeFallbackToImprove": fallback,
    }
    task = Task(
        description="返回且只返回 JSON。保持20关、每关至少3个活动、只用允许模块并排除儿童不想玩的类型。\n" + json.dumps(prompt, ensure_ascii=False),
        expected_output="符合 level-plan-v1 的 JSON 对象", agent=agent,
    )
    try:
        output = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False).kickoff()
        raw = getattr(output, "raw", str(output)).strip()
        result = json.loads(raw[raw.find("{"):raw.rfind("}") + 1])
        if not _valid_model_result(result, context):
            return None
        result["generatedBy"] = {"provider": "crewai", "model": model, "fallback": False}
        result.setdefault("extension", fallback["extension"]); result.setdefault("notice", fallback["notice"])
        return result
    except Exception:
        return None


def build_curriculum(profile: dict | None, child: dict | None, assessments: list[dict],
                     training_records: list[dict], excluded_types: list[str] | None = None) -> dict[str, Any]:
    context = build_context(profile, child, assessments, training_records, excluded_types)
    fallback = _local_curriculum(context)
    generated = _crewai_curriculum(context, fallback)
    if generated:
        return generated
    if os.getenv("LEVEL_AGENT_CREWAI", "0") == "1":
        fallback["generatedBy"]["fallback"] = True
    return fallback

"""档案画像与个性化训练 Agent。

输入是已经离线 OCR 并加密保存的逐页文字。Agent 先建立可追溯的定性证据，
再生成 L0-L4 六域画像、训练参数和可直接作答的游戏题。自动结果始终为草稿，
专业人员审核后才能成为儿童端的有效题集。
"""
from __future__ import annotations

import math
import re
import uuid
from datetime import datetime, timezone

from question_variants import ALTERNATES, MEMORY_PREVIEWS, MODES, OBSERVED_ITEMS

DOMAINS = {
    "A": {"name": "注意与感知", "keywords": ("注意", "专注", "分心", "视觉", "听觉", "感知", "注视", "搜索", "辨别", "颜色", "形状")},
    "B": {"name": "记忆", "keywords": ("记忆", "回忆", "记住", "再认", "序列", "保持", "遗忘", "工作记忆")},
    "C": {"name": "执行与逻辑", "keywords": ("分类", "推理", "因果", "计划", "顺序", "执行", "规则", "数量", "解决问题", "转换")},
    "D": {"name": "语言沟通", "keywords": ("语言", "表达", "理解", "指令", "命名", "词汇", "句子", "交流", "沟通", "发音", "构音", "AAC")},
    "E": {"name": "社会情绪", "keywords": ("情绪", "社交", "互动", "同伴", "轮流", "共同注意", "目光", "回应", "焦虑", "哭闹", "主动交往")},
    "F": {"name": "生活适应", "keywords": ("生活自理", "适应", "进食", "穿衣", "如厕", "洗手", "动作", "精细", "粗大", "模仿", "协调", "日常生活")},
}

STRENGTH_CUES = ("能够", "可以", "会", "独立", "完成", "掌握", "稳定", "提高", "进步", "良好", "达到", "主动")
NEED_CUES = ("不能", "不会", "困难", "较差", "不足", "需要", "需提示", "依赖", "容易分心", "回避", "欠佳", "未掌握", "不稳定")
PROMPT_LEVELS = (("肢体辅助", ("肢体辅助", "手把手")), ("示范提示", ("示范", "模仿")), ("视觉提示", ("手势", "图片提示", "视觉提示")), ("语音提示", ("口头提示", "语言提示", "重复指令")))
RISK_TERMS = ("癫痫", "自伤", "攻击", "吞咽", "跌倒", "严重情绪爆发")
RISK_NEGATIONS = ("无", "没有", "否认", "未见", "未发生", "不存在")

MODULES = {
    "P01": ("颜色识别", "A", "请找到红色的东西", "🍎", ["🍎", "🥦", "🫐", "🍌"]),
    "P02": ("形状辨认", "A", "请找到圆形", "⚽", ["⚽", "📕", "🔺", "⭐"]),
    "P03": ("视觉搜索", "A", "请找到不一样的一个", "⭐", ["🌙", "🌙", "⭐", "🌙"]),
    "P04": ("听觉注意", "A", "听一听：请点小狗", "🐶", ["🐶", "🐱", "🐰", "🐼"]),
    "M01": ("物品配对", "B", "哪个和杯子最有关系", "💧", ["💧", "👟", "🚗", "🎈"]),
    "M02": ("翻牌记忆", "B", "刚才看到的是哪个水果", "🍓", ["🍓", "🚗", "🌙", "🧸"]),
    "M03": ("序列回忆", "B", "请找到刚才的顺序", "☀️🌙", ["☀️🌙", "🌙☀️", "⭐☀️", "🌙⭐"]),
    "M04": ("工作记忆", "B", "刚才最后出现的是谁", "🦋", ["🦋", "🐟", "🐸", "🐰"]),
    "L01": ("图片命名", "D", "哪个是苹果", "🍎", ["🍎", "🚗", "👟", "🐶"]),
    "L02": ("句子表达", "D", "小猫正在做什么", "💤", ["💤", "⚽", "🍎", "🎨"]),
    "L03": ("指令理解", "D", "请点一下会飞的动物", "🐦", ["🐦", "🐟", "🐢", "🐶"]),
    "L04": ("AAC图片选择", "D", "口渴时可以选择什么", "💧", ["💧", "🧸", "👟", "🚗"]),
    "E01": ("因果关系", "C", "下雨了，出门需要什么", "☂️", ["☂️", "🧢", "🪥", "🥄"]),
    "E02": ("分类整理", "C", "哪个不是水果", "🚗", ["🍎", "🍌", "🚗", "🍓"]),
    "E03": ("数量认知", "C", "哪一组有两个", "🍎🍎", ["🍎", "🍎🍎", "🍎🍎🍎", "🍎🍎🍎🍎"]),
    "E04": ("计划与顺序", "C", "睡觉前应该先做什么", "🪥", ["🪥", "⚽", "🎨", "🚲"]),
    "S01": ("情绪识别", "E", "收到礼物可能是什么心情", "😊", ["😊", "😢", "😠", "😴"]),
    "S02": ("轮流与共同注意", "E", "轮到朋友时，我们可以怎么做", "⏳", ["⏳", "💢", "🏃", "🙈"]),
    "S03": ("社交规则", "E", "想一起玩，可以怎么做", "🙋", ["🙋", "💢", "🏃", "🙅"]),
    "D01": ("生活步骤", "F", "洗手时先做什么", "🚰", ["🚰", "🛏️", "📺", "⚽"]),
    "D02": ("精细动作与点选", "F", "请轻轻点一下小星星", "⭐", ["⭐", "🌙", "☁️", "☀️"]),
    "D03": ("模仿与节律动作", "F", "跟着做一做，然后点完成", "✅", ["✅"]),
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def identifier(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


def sentences(text: str) -> list[str]:
    # “能够一步，但两步需要提示”必须拆成一条优势和一条支持需求，不能相互抵消。
    return [part.strip() for part in re.split(r"[。；;！？!?，,\n]+|(?:但是|但|而)", text) if 4 <= len(part.strip()) <= 180]


def prompt_level(sentence: str) -> str:
    for level, cues in PROMPT_LEVELS:
        if any(cue in sentence for cue in cues):
            return level
    return "无明确提示"


def direction(sentence: str) -> str:
    need = sum(cue in sentence for cue in NEED_CUES)
    strength = sum(cue in sentence for cue in STRENGTH_CUES)
    # 同一句出现“完成……需要提示”时，训练含义仍是需要支持。
    if need:
        return "support_needed"
    if strength:
        return "strength"
    return "neutral"


def extract_evidence(pages: list[dict]) -> tuple[list[dict], list[str]]:
    evidence, risks, seen = [], [], set()
    for page in pages:
        text = page.get("text", "")
        base_confidence = max(.1, min(1.0, float(page.get("confidence", 0))))
        for sentence in sentences(text):
            for risk in RISK_TERMS:
                risk_at = sentence.find(risk)
                prefix = sentence[max(0, risk_at - 5):risk_at] if risk_at >= 0 else ""
                if risk_at >= 0 and not any(word in prefix for word in RISK_NEGATIONS) and risk not in risks:
                    risks.append(risk)
            matches = []
            for domain, config in DOMAINS.items():
                hits = sum(keyword.lower() in sentence.lower() for keyword in config["keywords"])
                if hits:
                    matches.append((domain, hits))
            if not matches:
                continue
            best_hits = max(item[1] for item in matches)
            for domain, hits in matches:
                if hits < best_hits:
                    continue
                signature = (domain, sentence)
                if signature in seen:
                    continue
                seen.add(signature)
                evidence.append({
                    "evidenceId": identifier("EVD"), "documentId": page["documentId"],
                    "page": page["page"], "pageType": page.get("pageType", "other"),
                    "domain": domain, "direction": direction(sentence),
                    "promptLevel": prompt_level(sentence), "text": sentence,
                    "confidence": round(min(.95, base_confidence * (.72 + min(hits, 3) * .08)), 3),
                })
    return evidence, risks


def build_domain_profile(domain: str, evidence: list[dict]) -> dict:
    items = [item for item in evidence if item["domain"] == domain]
    if not items:
        return {"domain": domain, "name": DOMAINS[domain]["name"], "level": 0, "score": None,
                "confidence": 0, "label": "资料不足，使用探索性起点", "contradiction": False,
                "evidenceCount": 0, "strengths": [], "supportNeeds": [], "promptLevels": []}
    positive = [item for item in items if item["direction"] == "strength"]
    needs = [item for item in items if item["direction"] == "support_needed"]
    neutral = [item for item in items if item["direction"] == "neutral"]
    weighted = sum((1 if item["direction"] == "strength" else -1 if item["direction"] == "support_needed" else 0) * item["confidence"] for item in items)
    total_weight = sum(item["confidence"] for item in items) or 1
    level = max(1, min(4, round(2.5 + 1.35 * weighted / total_weight)))
    score = {1: 28, 2: 46, 3: 66, 4: 84}[level]
    confidence = min(.92, (sum(item["confidence"] for item in items) / len(items)) * (.45 + .12 * math.log2(len(items) + 1)))
    labels = {1: "需要充分支持", 2: "可在提示下完成部分任务", 3: "基本能够完成", 4: "表现较稳定，可尝试泛化"}
    prompts = sorted({item["promptLevel"] for item in items if item["promptLevel"] != "无明确提示"})
    return {"domain": domain, "name": DOMAINS[domain]["name"], "level": level, "score": score,
            "confidence": round(confidence, 3), "label": labels[level],
            "contradiction": bool(positive and needs), "evidenceCount": len(items),
            "strengths": [item["text"] for item in positive[:3]],
            "supportNeeds": [item["text"] for item in needs[:3]],
            "neutralEvidence": [item["text"] for item in neutral[:2]], "promptLevels": prompts}


def parameters_for(level: int, prompts: list[str]) -> dict:
    if level == 0:
        return {"difficulty": 1, "optionCount": 2, "instructionSteps": 1, "prompt": "视觉+语音", "responseWindow": "宽松", "exploration": True}
    return {
        "difficulty": {1: 1, 2: 2, 3: 3, 4: 4}[level],
        "optionCount": {1: 2, 2: 3, 3: 4, 4: 4}[level],
        "instructionSteps": 1 if level <= 2 else 2,
        "prompt": "视觉+语音" if level == 1 else "按需提示" if level == 2 else "延迟提示",
        "responseWindow": "宽松" if level <= 2 else "常规", "exploration": False,
        "documentedPromptSupport": prompts,
    }


def make_question(module_id: str, profile: dict, variant_index: int = 0) -> dict:
    name, domain, prompt, target, choices = MODULES[module_id]
    mode = MODES.get(module_id, "choice")
    if mode in {"spoken", "guided"}:
        prompt, cue = OBSERVED_ITEMS[module_id][variant_index]
        target, choices = "自己完成", ["自己完成", "帮助后完成", "还没完成"]
    else:
        cue = None
        if variant_index:
            prompt, target, choices = ALTERNATES[module_id][variant_index - 1]
    params = parameters_for(profile["level"], profile.get("promptLevels", []))
    count = len(choices) if mode in {"spoken", "guided"} else max(2, min(len(choices), params["optionCount"]))
    selected = choices[:count]
    if target not in selected:
        selected[-1] = target
    offset = (list(MODULES).index(module_id) + variant_index) % len(selected)
    selected = selected[offset:] + selected[:offset]
    previews = MEMORY_PREVIEWS.get(module_id, [None, None, None])
    return {"questionId": identifier("Q"), "moduleId": module_id, "moduleName": name,
            "domain": domain, "difficulty": params["difficulty"], "prompt": prompt,
            "target": target, "choices": selected, "targetCue": target if "一样" in prompt else None,
            "mode": mode, "cue": cue, "preview": previews[variant_index],
            "spokenPrompt": prompt if mode == "audio" else None,
            "parameters": params, "encouragement": "谢谢你认真试一试！ 🌟",
            "errorFeedback": "没关系，我们一起慢慢看一看 👀"}

def build_solution(domain_profiles: list[dict], risks: list[str]) -> dict:
    by_domain = {item["domain"]: item for item in domain_profiles}
    priority_domains = sorted(DOMAINS, key=lambda key: (by_domain[key]["level"] == 0, by_domain[key]["level"], -by_domain[key]["confidence"]))
    module_plans, questions = [], []
    for module_id, (name, domain, *_rest) in MODULES.items():
        profile = by_domain[domain]; params = parameters_for(profile["level"], profile.get("promptLevels", []))
        priority = priority_domains.index(domain) + 1
        module_plans.append({"moduleId": module_id, "moduleName": name, "domain": domain,
                             "priority": priority, "frequencyPerWeek": 4 if priority <= 2 else 2,
                             "minutes": 5 if profile["level"] <= 2 else 8, "parameters": params,
                             "reason": f"{profile['name']}：{profile['label']}，依据 {profile['evidenceCount']} 条档案证据"})
        questions.extend(make_question(module_id, profile, variant_index) for variant_index in range(3))
    return {"solutionId": identifier("SOL"), "status": "draft", "onlinePaused": bool(risks),
            "riskFlags": risks, "priorityDomains": priority_domains, "modulePlans": module_plans,
            "questions": questions, "safety": "出现癫痫、自伤、攻击、严重情绪爆发、吞咽或跌倒风险时暂停线上训练并联系专业人员。"}


def analyze(pages: list[dict], batch_id: str, child_id: str) -> dict:
    evidence, risks = extract_evidence(pages)
    domains = [build_domain_profile(domain, evidence) for domain in DOMAINS]
    available = [item for item in domains if item["level"] > 0]
    confidence = round(sum(item["confidence"] for item in available) / len(available), 3) if available else 0
    profile = {"profileId": identifier("PRO-AGENT"), "childId": child_id, "sourceBatchId": batch_id,
               "status": "draft", "scale": "L0-L4", "confidence": confidence, "domains": domains,
               "riskFlags": risks, "requiresProfessionalReview": True,
               "notice": "这是基于历史文字证据的训练起点建议，不是诊断或标准化量表结果。"}
    return {"runId": identifier("AGR"), "provider": "local-evidence-agent", "model": "profile-agent-v1",
            "profile": profile, "solution": build_solution(domains, risks), "evidence": evidence,
            "createdAt": now()}

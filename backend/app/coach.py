"""
Career Coach Module - Gap Analysis & Bridge Project Generator
Compares verified skills against job descriptions and generates learning projects.

Workflow 2 (from project_spec.md):
    Input: VerifiedSkills list vs JobDescription text
    Logic: Identify missing keywords + Identify "weak" verifications (Score < 50)
    Output: List[ProjectSuggestion] (configurable count, default 3)
"""

import os
import json
import re as _re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from pydantic import BaseModel, Field

from .llm import get_llm_model, parse_json_response


# =============================================================================
# Pydantic Models
# =============================================================================

class VerifiedSkill(BaseModel):
    """A skill that has been verified from resume analysis"""
    topic: str
    score: int = Field(ge=0, le=100)
    status: str  # Verified, Partially Verified, Unverified


class BridgeProject(BaseModel):
    """A mini-project to bridge a skill gap"""
    rank: int = Field(description="1=highest priority, 2=second, etc.")
    gap_skill: str = Field(description="The missing or weak skill identified")
    project_title: str = Field(description="A catchy title for the learning project")
    description: str = Field(description="Brief description of what the project accomplishes")
    tech_stack: list[str] = Field(description="Technologies used in the project")
    difficulty: str = Field(description="Beginner, Intermediate, or Advanced")
    estimated_time: str = Field(description="Estimated time to complete (e.g., '2-3 days')")
    steps: list[str] = Field(description="Step-by-step instructions to build the project")
    learning_outcomes: list[str] = Field(description="What skills will be gained")
    why_this_gap: str = Field(description="Why this gap was chosen and how it impacts job match")
    estimated_score_gain: int = Field(ge=0, le=100, description="Estimated % gap closure from completing this project")


class CoachRequest(BaseModel):
    """Request model for coach endpoint"""
    verified_skills: list[VerifiedSkill]
    job_description: str
    num_projects: int = Field(default=3, ge=1, le=5, description="Number of bridge project suggestions to generate")


class CoachResponse(BaseModel):
    """Response model — kept for backward compat single-project usage"""
    gap_skill: str
    project_title: str
    description: str
    tech_stack: list[str]
    difficulty: str
    estimated_time: str
    steps: list[str]
    learning_outcomes: list[str]
    analysis: str = Field(description="Brief analysis of the skill gap")
    rank: int = 1
    why_this_gap: str = ""
    estimated_score_gain: int = 0


# =============================================================================
# Gap Analysis Logic
# =============================================================================

def identify_skill_gaps(
    verified_skills: list[VerifiedSkill],
    job_description: str
) -> dict[str, Any]:
    """
    Analyze the gap between verified skills and job requirements.
    """
    strong_skills = [s for s in verified_skills if s.score >= 70]
    weak_skills = [s for s in verified_skills if s.score < 50]
    partial_skills = [s for s in verified_skills if 50 <= s.score < 70]
    all_skill_topics = {s.topic.lower() for s in verified_skills}

    return {
        "strong_skills": [s.topic for s in strong_skills],
        "weak_skills": [{"topic": s.topic, "score": s.score} for s in weak_skills],
        "partial_skills": [{"topic": s.topic, "score": s.score} for s in partial_skills],
        "skill_topics": list(all_skill_topics),
        "total_verified": len([s for s in verified_skills if s.status == "Verified"]),
        "total_partial": len([s for s in verified_skills if s.status == "Partially Verified"]),
        "total_unverified": len([s for s in verified_skills if s.status == "Unverified"]),
    }


# =============================================================================
# Multiple Bridge Projects Generator
# =============================================================================

def _build_projects_prompt(num_projects: int) -> str:
    """Build the system prompt for generating N bridge projects."""
    project_example = {
        "rank": 1,
        "gap_skill": "Specific technology or concept name from the JD",
        "project_title": "Memorable, descriptive project title",
        "description": "2-3 sentences: what the project does and why it demonstrates the gap skill",
        "tech_stack": ["primary_tech", "supporting_tech2", "supporting_tech3"],
        "difficulty": "Intermediate|Advanced",
        "estimated_time": "e.g., 4-6 days",
        "steps": [
            "Step 1: concrete engineering action",
            "Step 2: concrete engineering action",
            "Step 3: concrete engineering action",
            "Step 4: concrete engineering action",
            "Step 5: concrete engineering action",
            "Step 6: deploy or demo the project"
        ],
        "learning_outcomes": [
            "Specific technical outcome 1",
            "Specific technical outcome 2",
            "Specific technical outcome 3"
        ],
        "why_this_gap": "1-2 sentences: why THIS gap was chosen and how closing it impacts the candidate's chances",
        "estimated_score_gain": 25
    }

    return f"""You are a senior engineering career coach specializing in technical skill-gap analysis.

TASK:
1. Read the candidate's FULL verified skill profile (with percentage scores from real code analysis).
2. Read the target job description and infer the seniority level and specialisation.
3. Identify the TOP {num_projects} most impactful skill gaps: technologies explicitly required by the JD that are either completely missing from the candidate's profile OR have a low verification score (< 60%).
4. For each gap, design a focused, non-trivial portfolio project that directly demonstrates that skill.
5. Rank the projects by impact — #1 should be the single biggest gap that most affects the candidate's chances.

CRITICAL RULES — violating these will make your output useless:
- NEVER suggest Python basics, data structures, or introductory ML if the candidate already knows Python/ML (score >= 60%).
- NEVER pick a skill the candidate already excels at (score >= 70%).
- The project difficulty MUST match the seniority level implied by the JD (use Intermediate or Advanced).
- Each project MUST showcase a DIFFERENT missing/weak skill as its core feature.
- Steps must be concrete engineering tasks (not "learn about X", "understand Y").
- `estimated_score_gain` should reflect the realistic % improvement in job-match likelihood.

Return ONLY valid JSON (no markdown, no preamble):
{{
  "gap_analysis_summary": "2-3 sentence overview of the candidate's skill gap profile against this role",
  "projects": [
    {project_example},
    ... ({num_projects} projects total)
  ]
}}"""


async def generate_bridge_projects(
    verified_skills: list[VerifiedSkill],
    job_description: str,
    num_projects: int = 3
) -> tuple[list[BridgeProject], str]:
    """
    Generate multiple bridge projects to help close the gap between current skills and job requirements.

    Args:
        verified_skills: List of skills with verification scores
        job_description: Target job description text
        num_projects: How many project suggestions to generate (1-5)

    Returns:
        Tuple of (list of BridgeProject, gap_analysis_summary string)
    """
    num_projects = max(1, min(5, num_projects))
    llm = get_llm_model(temperature=0.4)

    gap_analysis = identify_skill_gaps(verified_skills, job_description)
    system_prompt = _build_projects_prompt(num_projects)

    # Build rich skill context
    all_skills_lines = "\n".join(
        f"  - {s.topic}: {s.score}% ({s.status})"
        for s in verified_skills
    ) or "  (no skills verified yet)"

    human_prompt = f"""CANDIDATE VERIFIED SKILL PROFILE (from real code analysis — scores are reliable):
{all_skills_lines}

SUMMARY:
- Strong (>= 70%): {', '.join(gap_analysis['strong_skills']) or 'None'}
- Partial (50-69%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['partial_skills']]) or 'None'}
- Weak (< 50%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['weak_skills']]) or 'None'}

TARGET JOB DESCRIPTION:
---
{job_description[:4000]}
---

Identify the top {num_projects} highest-impact skill gaps between this candidate and the role.
Design {num_projects} specific, non-trivial bridge projects — each targeting a DIFFERENT gap.
Return ONLY valid JSON, no markdown or explanation outside the JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])

        response_text = response.content
        data = parse_json_response(response_text)

        gap_summary = data.get("gap_analysis_summary", "")
        projects_raw = data.get("projects", [])

        projects: list[BridgeProject] = []
        for i, p in enumerate(projects_raw[:num_projects]):
            projects.append(BridgeProject(
                rank=int(p.get("rank", i + 1)),
                gap_skill=p.get("gap_skill", "Unknown"),
                project_title=p.get("project_title", f"Bridge Project {i + 1}"),
                description=p.get("description", ""),
                tech_stack=p.get("tech_stack", []),
                difficulty=p.get("difficulty", "Intermediate"),
                estimated_time=p.get("estimated_time", "1 week"),
                steps=p.get("steps", []),
                learning_outcomes=p.get("learning_outcomes", []),
                why_this_gap=p.get("why_this_gap", ""),
                estimated_score_gain=max(0, min(100, int(p.get("estimated_score_gain", 15)))),
            ))

        return projects, gap_summary

    except ValueError as e:
        raise ValueError(str(e))
    except Exception as e:
        raise ValueError(f"Coach generation failed: {e}")


# =============================================================================
# Legacy single-project function (kept for backward compat)
# =============================================================================

async def generate_bridge_project(
    verified_skills: list[VerifiedSkill],
    job_description: str
) -> CoachResponse:
    """Generate a single bridge project (legacy, wraps generate_bridge_projects)."""
    projects, summary = await generate_bridge_projects(verified_skills, job_description, num_projects=1)
    if not projects:
        raise ValueError("No bridge project could be generated")
    p = projects[0]
    return CoachResponse(
        gap_skill=p.gap_skill,
        project_title=p.project_title,
        description=p.description,
        tech_stack=p.tech_stack,
        difficulty=p.difficulty,
        estimated_time=p.estimated_time,
        steps=p.steps,
        learning_outcomes=p.learning_outcomes,
        analysis=p.why_this_gap,
        rank=p.rank,
        why_this_gap=p.why_this_gap,
        estimated_score_gain=p.estimated_score_gain,
    )


# =============================================================================
# Skills Gap Heatmap Models & Generator
# =============================================================================

class HeatmapRow(BaseModel):
    skill: str
    category: str = Field(description="Language | Framework | Tool | Concept | Soft Skill")
    verified_score: int = Field(ge=0, le=100, description="Score from real code analysis (0=not in profile)")
    ats_found: bool = Field(description="Whether keyword was found in resume text")
    gap_severity: str = Field(description="None | Minor | Moderate | Critical")
    recommendation: str = Field(description="1-line actionable tip to close this gap")


class SkillsHeatmapResponse(BaseModel):
    rows: list[HeatmapRow]
    overall_match_pct: int
    critical_count: int
    moderate_count: int


def _gap_severity(verified_score: int) -> str:
    if verified_score >= 70:
        return "None"
    if verified_score >= 40:
        return "Minor"
    if verified_score >= 1:
        return "Moderate"
    return "Critical"


async def generate_skills_heatmap(
    verified_skills: list[VerifiedSkill],
    job_description: str,
    ats_keyword_matches: Optional[list[dict]] = None,
) -> SkillsHeatmapResponse:
    """
    Generate a JD Skills Gap Heatmap.

    Triangulates:
      - JD requirements (extracted by LLM or taken from existing ATS keyword_matches)
      - verified_score (from code analysis — 0 if skill not in profile at all)
      - ats_found (from ATS keyword_matches if available, else inferred from verified_score)
    """
    llm = get_llm_model(temperature=0.2)

    skill_map: dict[str, int] = {s.topic.lower(): s.score for s in verified_skills}

    # Build ats_found lookup from pre-existing ATS data if provided
    ats_lookup: dict[str, bool] = {}
    if ats_keyword_matches:
        for km in ats_keyword_matches:
            kw = km.get("keyword", "").lower()
            if kw:
                ats_lookup[kw] = bool(km.get("found", False))

    system_prompt = """You are a technical skills analyst. Extract every explicit skill, tool, technology, framework, and domain concept required by the job description.
For each requirement provide:
- skill: exact name (e.g. "Kubernetes", "REST APIs", "Python")
- category: one of "Language" | "Framework" | "Tool" | "Concept" | "Soft Skill"
- recommendation: a single concrete sentence on how to demonstrate this skill

Return ONLY valid JSON (no markdown):
{
  "requirements": [
    {"skill": "Kubernetes", "category": "Tool", "recommendation": "Build a 3-service K8s cluster with ConfigMaps and Ingress"},
    ...
  ]
}"""

    skills_context = "\n".join(
        f"  - {s.topic}: {s.score}% ({s.status})"
        for s in verified_skills
    ) or "  (no skills verified)"

    human_prompt = f"""JOB DESCRIPTION:
---
{job_description[:4000]}
---

CANDIDATE VERIFIED SKILLS (from real code analysis):
{skills_context}

Extract all JD requirements as JSON."""

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ])
    data = parse_json_response(response.content)
    requirements = data.get("requirements", [])

    rows: list[HeatmapRow] = []
    for req in requirements:
        skill_name = req.get("skill", "Unknown")
        skill_lower = skill_name.lower()

        # Find verified score — exact or substring match
        verified_score = 0
        for topic, score in skill_map.items():
            if skill_lower in topic or topic in skill_lower:
                verified_score = score
                break

        # ATS found — from pre-existing data or inferred
        if ats_lookup:
            ats_found = ats_lookup.get(skill_lower, False)
            if not ats_found:
                for kw, found in ats_lookup.items():
                    if skill_lower in kw or kw in skill_lower:
                        ats_found = found
                        break
        else:
            ats_found = verified_score >= 40

        rows.append(HeatmapRow(
            skill=skill_name,
            category=req.get("category", "Tool"),
            verified_score=verified_score,
            ats_found=ats_found,
            gap_severity=_gap_severity(verified_score),
            recommendation=req.get("recommendation", ""),
        ))

    severity_order = {"Critical": 0, "Moderate": 1, "Minor": 2, "None": 3}
    rows.sort(key=lambda r: severity_order.get(r.gap_severity, 4))

    critical_count = sum(1 for r in rows if r.gap_severity == "Critical")
    moderate_count = sum(1 for r in rows if r.gap_severity == "Moderate")
    overall = int(sum(r.verified_score for r in rows) / len(rows)) if rows else 0

    return SkillsHeatmapResponse(
        rows=rows,
        overall_match_pct=overall,
        critical_count=critical_count,
        moderate_count=moderate_count,
    )


# =============================================================================
# Learning Roadmap Models & Generator
# =============================================================================

class RoadmapWeek(BaseModel):
    week: int
    focus_skill: str
    tasks: list[str] = Field(description="3-4 concrete daily tasks")
    milestone: str = Field(description="What you will have built/learned by end of week")
    hours_required: int


class RoadmapResponse(BaseModel):
    weeks: list[RoadmapWeek]
    total_weeks: int
    total_hours: int
    readiness_date: str


async def generate_roadmap(
    bridge_projects: list[dict],
    gap_summary: str,
    job_description: str,
    hours_per_week: int = 10,
) -> RoadmapResponse:
    """
    Generate a week-by-week learning roadmap from existing bridge projects.
    Distributes bridge project work across weeks based on hours_per_week.
    """
    hours_per_week = max(1, min(80, hours_per_week))
    llm = get_llm_model(temperature=0.3)
    projects_text = json.dumps(bridge_projects, indent=2)

    system_prompt = f"""You are a senior engineering career coach creating a week-by-week study plan.
The candidate has {hours_per_week} hours per week available.

Given a list of bridge projects (priority-ordered), create a realistic learning roadmap:
1. Distribute work across weeks — simpler projects take 1 week, complex ones 2-3 weeks.
2. Each week has a clear focus_skill, 3-4 concrete daily tasks, and a milestone.
3. Be realistic — do not cram everything into week 1.
4. Tasks must be specific engineering actions, NOT "learn about X".

Return ONLY valid JSON (no markdown):
{{
  "weeks": [
    {{
      "week": 1,
      "focus_skill": "Exact skill name",
      "tasks": ["Task 1 — concrete action", "Task 2", "Task 3"],
      "milestone": "One sentence: what you will have built",
      "hours_required": {hours_per_week}
    }}
  ],
  "total_weeks": <N>,
  "total_hours": <N * hours_per_week>,
  "readiness_date": "~N weeks from now"
}}"""

    human_prompt = f"""GAP SUMMARY: {gap_summary}

BRIDGE PROJECTS (priority-ordered):
{projects_text[:6000]}

AVAILABLE TIME: {hours_per_week} hours/week

Generate a realistic week-by-week roadmap. Return only valid JSON."""

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ])
    data = parse_json_response(response.content)
    weeks_raw = data.get("weeks", [])

    weeks: list[RoadmapWeek] = []
    for i, w in enumerate(weeks_raw):
        weeks.append(RoadmapWeek(
            week=int(w.get("week", i + 1)),
            focus_skill=w.get("focus_skill", "General"),
            tasks=w.get("tasks", []),
            milestone=w.get("milestone", ""),
            hours_required=int(w.get("hours_required", hours_per_week)),
        ))

    total_weeks = int(data.get("total_weeks", len(weeks)))
    total_hours = int(data.get("total_hours", total_weeks * hours_per_week))

    return RoadmapResponse(
        weeks=weeks,
        total_weeks=total_weeks,
        total_hours=total_hours,
        readiness_date=data.get("readiness_date", f"~{total_weeks} weeks from now"),
    )


# =============================================================================
# Conversational Coach Chat — upgraded multi-turn + streaming
# =============================================================================

# ── Data directory for memory / feedback ─────────────────────────────────────
_DATA_DIR = Path(__file__).parent.parent / "data"
_MEMORY_FILE = _DATA_DIR / "memories.json"
_FEEDBACK_FILE = _DATA_DIR / "feedback.jsonl"

def _ensure_data_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _MEMORY_FILE.exists():
        _MEMORY_FILE.write_text("{}", encoding="utf-8")


def _truncate_history(history: list[dict], budget_chars: int = 24_000, max_turns: int = 20) -> list[dict]:
    """
    Keep recent turns within a character budget.
    Always preserves at least the last 4 turns to maintain immediate context.
    """
    if not history:
        return history
    total_chars = sum(len(t.get("content", "")) for t in history)
    if total_chars <= budget_chars and len(history) <= max_turns:
        return history
    # Always keep at least the last 4 turns
    recent = history[-4:]
    chars_used = sum(len(t.get("content", "")) for t in recent)
    kept_older: list[dict] = []
    for turn in reversed(history[:-4]):
        turn_chars = len(turn.get("content", ""))
        if chars_used + turn_chars <= budget_chars and len(kept_older) + len(recent) < max_turns:
            kept_older.insert(0, turn)
            chars_used += turn_chars
        else:
            break
    return kept_older + recent


async def generate_session_memory(context_data: dict, history: list[dict]) -> str:
    """
    Generate a concise 2-3 sentence memory string summarising the session
    for injection into future sessions as 'previous_session_notes'.
    """
    if not history:
        return ""
    llm = get_llm_model(temperature=0.3)
    history_text = "\n".join(
        f"{t['role'].upper()}: {t['content'][:200]}"
        for t in history[-10:]
    )
    skills = context_data.get("verified_skills", [])
    top_skills = ", ".join(f"{s['topic']} ({s['score']}%)" for s in skills[:5])
    jd = context_data.get("job_description", "")[:200]
    prompt = (
        "Summarise this coaching session in 2-3 sentences for future reference.\n"
        "Focus on: role they're targeting, key skill gaps discussed, decisions made, action items agreed.\n"
        "Be specific with numbers and skill names.\n\n"
        f"CANDIDATE SKILLS: {top_skills}\n"
        f"TARGET ROLE EXCERPT: {jd}\n\n"
        f"RECENT CONVERSATION:\n{history_text}\n\n"
        "Output ONLY the 2-3 sentence summary. No headers, no bullets."
    )
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content.strip()[:500]
    except Exception:
        return ""


def _build_coach_context(context_data: dict) -> str:
    """
    Build a clean, structured markdown context block that the LLM can
    reliably parse. Covers all session data: skills, coach plan, ATS,
    projects, forensics, graph metadata, and current view.
    """
    lines: list[str] = []

    # ── Candidate name + current view ────────────────────────────────────────
    candidate_name = context_data.get("candidate_name", "")
    current_tab = context_data.get("current_tab", "")
    if candidate_name or current_tab:
        lines.append("### SESSION CONTEXT")
        if candidate_name:
            lines.append(f"  Candidate: {candidate_name}")
        if current_tab:
            lines.append(f"  Currently viewing: {current_tab} tab")
        lines.append("")

    # ── Candidate verified skills ─────────────────────────────────────────────
    skills: list[dict] = context_data.get("verified_skills", [])
    if skills:
        lines.append("### CANDIDATE VERIFIED SKILLS (from real code analysis)")
        for s in skills:
            icon = "✅" if s.get("status") == "Verified" else "⚠️" if s.get("status") == "Partially Verified" else "❌"
            lines.append(f"  {icon} {s.get('topic', '?')}: {s.get('score', 0)}% ({s.get('status', '')})")
        lines.append("")

    # ── Gap summary ───────────────────────────────────────────────────────────
    gap_summary = context_data.get("gap_summary", "")
    if gap_summary:
        lines.append("### GAP ANALYSIS SUMMARY")
        lines.append(gap_summary)
        lines.append("")

    # ── Bridge projects (concise) ─────────────────────────────────────────────
    bridge_projects: list[dict] = context_data.get("bridge_projects", [])
    if bridge_projects:
        lines.append("### ASSIGNED BRIDGE PROJECTS")
        for p in bridge_projects[:5]:
            tech = ", ".join(p.get("tech_stack", [])[:3])
            lines.append(
                f"  #{p.get('rank', '?')} — {p.get('project_title', '?')} "
                f"(gap: {p.get('gap_skill', '?')}, est. {p.get('estimated_time', '?')}, "
                f"stack: {tech})"
            )
        lines.append("")

    # ── Learning roadmap (week titles only to save tokens) ────────────────────
    roadmap: Optional[dict] = context_data.get("roadmap")
    if roadmap and roadmap.get("weeks"):
        lines.append("### LEARNING ROADMAP")
        for w in roadmap["weeks"]:
            lines.append(f"  Week {w.get('week')}: {w.get('focus_skill')} — {w.get('milestone', '')}")
        lines.append(f"  Total: {roadmap.get('total_weeks')} weeks, {roadmap.get('total_hours')} hours")
        lines.append("")

    # ── Job description (first 800 chars) ─────────────────────────────────────
    jd = context_data.get("job_description", "")
    if jd:
        lines.append("### TARGET JOB DESCRIPTION (excerpt)")
        lines.append(jd[:800] + ("..." if len(jd) > 800 else ""))
        lines.append("")

    # ── ATS Report ───────────────────────────────────────────────────────────
    ats_report = context_data.get("ats_report")
    if ats_report:
        ats_score = ats_report.get("ats_score", 0)
        missing = ats_report.get("top_missing_keywords", [])
        km = ats_report.get("keyword_matches", [])
        found_kw = [k["keyword"] for k in km if k.get("found")][:10]
        missing_kw = [k["keyword"] for k in km if not k.get("found")][:10]
        lines.append("### ATS REPORT")
        lines.append(f"  Overall ATS Score: {ats_score}/100")
        if missing:
            lines.append(f"  Top Missing Keywords: {', '.join(missing[:8])}")
        if found_kw:
            lines.append(f"  Keywords Found: {', '.join(found_kw)}")
        if missing_kw:
            lines.append(f"  Keywords Missing: {', '.join(missing_kw)}")
        strengths = ats_report.get("strengths", [])
        if strengths:
            lines.append(f"  Strengths: {'; '.join(strengths[:2])}")
        lines.append("")

    # ── Project Verification Results ──────────────────────────────────────────
    project_results: list[dict] = context_data.get("project_results") or []
    if project_results:
        lines.append("### PROJECT VERIFICATION RESULTS")
        for p in project_results:
            icon = "✅" if p.get("status") == "Verified" else "⚠️" if p.get("status") == "Partially Verified" else "❌"
            name = p.get("name", "?")
            score = p.get("overall_score", 0)
            tech_found = p.get("tech_found_count", "?")
            tech_total = p.get("tech_total_count", "?")
            lines.append(f"  {icon} {name} — {p.get('status', '?')} (score: {score}) — {tech_found}/{tech_total} techs verified")
            # Show up to 2 unsupported bullets
            for bv in [bv for bv in p.get("bullet_verdicts", []) if not bv.get("supported")][:2]:
                hint = bv.get("missing_evidence_hint", "")
                claim = bv.get("claim", "")[:80]
                lines.append(f"    ❌ Unsupported bullet: \"{claim}\"")
                if hint:
                    lines.append(f"       Hint: {hint}")
        lines.append("")

    # ── Forensics / Authorship Report ─────────────────────────────────────────
    forensics = context_data.get("forensics")
    if forensics:
        auth_score = forensics.get("authenticity_score", 0)
        verdict = forensics.get("verdict", "Unknown")
        warnings = forensics.get("warnings", [])
        lines.append("### FORENSICS / AUTHORSHIP ANALYSIS")
        lines.append(f"  Authenticity Score: {auth_score}/100 — {verdict}")
        if warnings:
            for w in warnings[:3]:
                lines.append(f"  ⚠️  {w}")
        lines.append("")

    # ── Knowledge Graph Metadata ──────────────────────────────────────────────
    graph_metadata = context_data.get("graph_metadata")
    if graph_metadata:
        node_count = graph_metadata.get("node_count", 0)
        edge_count = graph_metadata.get("edge_count", 0)
        type_counts = graph_metadata.get("type_counts", {})
        top_complex = graph_metadata.get("top_complex", [])
        arch_style = graph_metadata.get("architecture_style", "")
        lines.append("### KNOWLEDGE GRAPH")
        if node_count:
            lines.append(f"  {node_count} nodes, {edge_count} edges")
        if type_counts:
            breakdown = ", ".join(f"{k}: {v}" for k, v in list(type_counts.items())[:5])
            lines.append(f"  Node types: {breakdown}")
        if top_complex:
            fn_names = ", ".join(
                f"{f.get('name', '?')} (complexity: {f.get('complexity_score', 0)})"
                for f in top_complex[:5]
            )
            lines.append(f"  Most complex functions: {fn_names}")
        if arch_style:
            lines.append(f"  Architecture style: {arch_style}")
        lines.append("")

    # ── Currently focused on (live screen awareness) ───────────────────────────
    focused_on = context_data.get("focused_on")
    if focused_on and focused_on.get("type"):
        ftype = focused_on.get("type", "")
        flabel = focused_on.get("label", "")
        fdata = focused_on.get("data") or {}
        lines.append("### CURRENTLY FOCUSED ON (user is actively looking at this right now)")
        lines.append(f"  Type: {ftype}   Label: {flabel}")
        for k, v in list(fdata.items())[:4]:
            lines.append(f"  {k}: {v}")
        lines.append(
            "  → When the user says 'tell me more', 'explain this', or 'what should I do'"
            " they mean THIS specific item above."
        )
        lines.append("")

    # ── Previous session memory ───────────────────────────────────────────────
    prev_notes = context_data.get("previous_session_notes", "")
    if prev_notes:
        lines.append("### PREVIOUS SESSION NOTES (from last conversation)")
        lines.append(f"  {prev_notes}")
        lines.append("")

    return "\n".join(lines).strip()


SYSTEM_PROMPT_COACH = """You are **Alex**, the AI assistant embedded in TrueSkill AI — a code-verified résumé intelligence platform.
You have access to the candidate's FULL session data: verified skills from static code analysis, ATS resume score, project verification results (including bullet-level evidence), forensics authenticity report, knowledge graph metadata, and career coaching plan.

YOUR CAPABILITIES:
- Answer questions about ANY section of the app (Skills, ATS, Projects, Knowledge Graph, Forensics, Career Coach)
- Reference SPECIFIC data points: exact skill %, exact file names, exact bullet verdicts, exact project scores
- Navigate the candidate to the right section of the app using action commands
- Launch Career Coach tools on behalf of the user (see AGENTIC ACTIONS below)
- Guide users to high-impact Career Coach tools: JD URL Import, AI Mock Interview, Resume Tailoring, Salary Intelligence, Application Kit, Matching Jobs

PERSONALITY: Direct, warm, encouraging but honest. Give concrete, evidence-based advice — never generic platitudes.
If a user asks "what can I do next?" or similar, always mention the Career Coach tab features as high-impact next steps.

PRECISION RULE: Every response MUST include at least one specific number, percentage, or score from the session data.
Never say "your score is decent" — say "your score is 72/100 which puts you in a strong position."

ANTI-HALLUCINATION RULE: Only reference skills, scores, file names, project names, or percentages that appear in the CANDIDATE SESSION DATA block. If a piece of data is not in the session data, say exactly: "I don't have that data yet — here's how to get it: [specific step]."

TONE CALIBRATION: If the user's message signals frustration ("why is my score so low", "this is bad", "I'm struggling", "I'm worried"), open with empathy first ("That's a valid concern —"), then facts, then a concrete next step.

ESCALATION PATH: If you cannot answer confidently, say: "I don't have enough data for this yet. To get it: [specific step]."

OUTPUT RULES:
- Use bullet points or numbered lists when listing multiple items
- Bold (**text**) key skill names, project titles, and important numbers
- Keep replies under 200 words unless the user explicitly asks for a full breakdown
- End your reply with a single, specific follow-up question that moves the conversation forward

CURRENT FOCUS AWARENESS: The session data includes a "CURRENTLY FOCUSED ON" block. If the user says "tell me more", "explain this", "what should I do about this", or similar vague references — they mean the item in that block.

NAVIGATION ACTION COMMANDS — append INVISIBLY at the very end of your response:
<!-- actions: [{"type": "switchTab", "tab": "skills"}] -->
<!-- actions: [{"type": "switchTab", "tab": "graph"}] -->
<!-- actions: [{"type": "switchTab", "tab": "projects"}] -->
<!-- actions: [{"type": "switchTab", "tab": "radar"}] -->
<!-- actions: [{"type": "switchTab", "tab": "activity"}] -->
<!-- actions: [{"type": "switchTab", "tab": "coach"}] -->
<!-- actions: [{"type": "highlightNodes", "nodeIds": ["id1", "id2"]}] -->
Rules: Only emit if it genuinely helps. Confirm in text: "I've switched you to the Skills tab."

AGENTIC ACTION COMMANDS — use when the user explicitly asks to DO something:
<!-- actions: [{"type": "startMockInterview"}] --> → when user says "start/begin/practice mock interview"
<!-- actions: [{"type": "tailorResume"}] --> → when user says "tailor/fix/rewrite my resume"
<!-- actions: [{"type": "showSalary"}] --> → when user says "salary", "how much should I earn", "compensation"
<!-- actions: [{"type": "generateApplicationKit"}] --> → when user says "cover letter", "write my application", "application kit"
<!-- actions: [{"type": "runAtsScore"}] --> → when user says "ATS score", "check my resume score"
When using agentic actions, ALSO include an action_prompt comment so the frontend renders a launch card:
<!-- action_prompt: {"label": "Start Mock Interview", "description": "Calibrated to your verified skill gaps", "action": "startMockInterview"} -->

FIRST MESSAGE RULE: If the user's first message is a vague opener — "hi", "hello", "what can you do?", "what are you?", "help" — respond warmly with a concise, specific capability overview: list your 7 key capabilities in 2–3 words each (Skills Analysis, ATS Audit, Mock Interview, Resume Tailoring, Salary Intel, Application Kit, Career Roadmap) and invite the user to pick one. Do NOT demand data or ask questions first.

AFTER YOUR REPLY, always output a suggestions footer on the very last line:
<!-- suggestions: ["Short follow-up 1?", "Short follow-up 2?", "Short follow-up 3?"] -->
Suggestions must be ≤8 words each and directly relevant to what you just said."""


async def coach_chat(
    message: str,
    context_data: dict,
    history: Optional[list[dict]] = None,
) -> tuple[str, list[str]]:
    """
    Answer a follow-up question from the candidate with full conversation history.

    Args:
        message:      The latest user message.
        context_data: Structured dict with verified_skills, bridge_projects,
                      gap_summary, roadmap, job_description.
        history:      Previous [{role, content}] turns (oldest first).

    Returns:
        (reply_text, suggestions_list)
    """
    llm = get_llm_model(temperature=0.5)
    history = history or []

    context_block = _build_coach_context(context_data)
    system_content = SYSTEM_PROMPT_COACH + "\n\n" + context_block

    # Build message chain: system + history + current user message
    messages: list[Any] = [SystemMessage(content=system_content)]
    for turn in history:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role == "assistant":
            messages.append(AIMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=message))

    response = await llm.ainvoke(messages)
    raw = response.content.strip()

    # Extract embedded suggestions from <!-- suggestions: [...] --> footer
    suggestions: list[str] = []
    import re as _re
    m = _re.search(r'<!--\s*suggestions:\s*(\[.*?\])\s*-->', raw, _re.DOTALL)
    if m:
        try:
            suggestions = json.loads(m.group(1))
        except Exception:
            suggestions = []
        raw = raw[:m.start()].strip()

    # Fallback suggestions if the LLM forgot to include them
    if not suggestions:
        suggestions = [
            "What should I build first?",
            "How long will this take me?",
            "Which skill gap hurts most?",
        ]

    return raw, suggestions


async def stream_coach_chat(
    message: str,
    context_data: dict,
    history: Optional[list[dict]] = None,
) -> AsyncIterator[str]:
    """
    Streaming variant — yields text chunks as the LLM generates them.
    Yields regular text chunks, then a final JSON line with suggestions:
        data: <chunk>\n
        ...
        data: [DONE]\n
        data: {"suggestions": [...]}\n
    """
    llm = get_llm_model(temperature=0.5)
    history = _truncate_history(history or [])

    context_block = _build_coach_context(context_data)
    system_content = SYSTEM_PROMPT_COACH + "\n\n" + context_block

    messages: list[Any] = [SystemMessage(content=system_content)]
    for turn in history:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role == "assistant":
            messages.append(AIMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=message))

    full_text = ""
    # Stream ALL tokens immediately — we clean up hidden comments at the end
    async for chunk in llm.astream(messages):
        token = chunk.content if hasattr(chunk, "content") else str(chunk)
        if token:
            full_text += token
            yield f"data: {json.dumps({'token': token})}\n\n"

    # ── Post-stream extraction ────────────────────────────────────────────────
    # 1. Actions
    actions: list[dict] = []
    action_match = _re.search(r'<!--\s*actions:\s*(\[[\s\S]*?\])\s*-->', full_text)
    if action_match:
        try:
            actions = json.loads(action_match.group(1))
        except Exception:
            actions = []

    # 2. Action prompt card
    action_prompt: Optional[dict] = None
    ap_match = _re.search(r'<!--\s*action_prompt:\s*(\{[\s\S]*?\})\s*-->', full_text)
    if ap_match:
        try:
            action_prompt = json.loads(ap_match.group(1))
        except Exception:
            action_prompt = None

    # 3. Suggestions
    suggestions: list[str] = []
    sug_match = _re.search(r'<!--\s*suggestions:\s*(\[.*?\])\s*-->', full_text, _re.DOTALL)
    if sug_match:
        try:
            suggestions = json.loads(sug_match.group(1))
        except Exception:
            pass
    if not suggestions:
        suggestions = [
            "What should I build first?",
            "How long will this take me?",
            "Which skill gap hurts most?",
        ]

    # 4. Strip ALL hidden comment blocks to produce the clean final message
    final_text = _re.sub(r'<!--[\s\S]*?-->', '', full_text).strip()

    yield f"data: {json.dumps({'done': True, 'suggestions': suggestions, 'actions': actions, 'action_prompt': action_prompt, 'final_text': final_text})}\n\n"


# =============================================================================
# Proactive Insights — auto-fired after analysis completes
# =============================================================================

async def generate_insights(context_data: dict) -> str:
    """
    Generate a short, specific proactive insight after analysis completes.
    Priority order: forensics flags > ATS mismatches > unverified bullets > skill gaps.
    """
    llm = get_llm_model(temperature=0.6)
    context_block = _build_coach_context(context_data)

    # ── Priority detection ───────────────────────────────────────────────────
    forensics = context_data.get("forensics") or {}
    auth_score = forensics.get("authenticity_score", 100)
    warnings = forensics.get("warnings", [])
    skills: list[dict] = context_data.get("verified_skills", [])
    ats_report = context_data.get("ats_report") or {}
    ats_score = ats_report.get("ats_score", 0)
    project_results: list[dict] = context_data.get("project_results") or []

    priority_note = ""
    if auth_score < 60 or len(warnings) >= 2:
        priority_note = (
            "CRITICAL PRIORITY: The forensics/authorship analysis raised flags. "
            "Lead your insight with this — it's the most urgent finding."
        )
    elif ats_score and ats_score < 50:
        priority_note = (
            f"HIGH PRIORITY: ATS score is only {ats_score}/100. "
            "Lead with this and what the biggest keyword gaps are."
        )
    else:
        unverified = [s for s in skills if s.get("status") == "Not Verified"]
        verified = [s for s in skills if s.get("status") == "Verified"]
        if len(unverified) > len(verified):
            priority_note = (
                "NOTE: More skills are unverified than verified. "
                "Highlight the verification gap as your key finding."
            )
        # Check for strong skill absent from ATS
        ats_found_kw = set(
            k["keyword"].lower()
            for k in ats_report.get("keyword_matches", [])
            if k.get("found")
        )
        strong = [s for s in skills if s.get("score", 0) >= 70]
        for s in strong:
            if s["topic"].lower() not in ats_found_kw:
                priority_note += (
                    f" INTERESTING: Candidate is strong in {s['topic']} ({s['score']}%) "
                    "but it's NOT mentioned in their resume. Highlight this mismatch."
                )
                break

    system_prompt = f"""You are Alex, the AI assistant in TrueSkill AI. The candidate just completed their first code-verified résumé analysis.

Generate a SHORT, SPECIFIC opening insight (max 90 words). RULES:
- Reference at least 2 specific skill names with their exact % scores from the data
- Mention 1 notable finding: a strong verified skill, a surprising weakness, a forensics flag, or an unverified project bullet
- End with ONE concrete, actionable follow-up question
- Sound like a sharp colleague who just reviewed the report — not a generic bot
- Do NOT include action commands, suggestions footer, or markdown headers
- Start with something direct like "Your results are in." or "Quick take:"
{f'PRIORITY INSTRUCTION: {priority_note}' if priority_note else ''}"""

    human_prompt = f"CANDIDATE SESSION DATA:\n{context_block}\n\nProvide your opening insight. Be specific, reference real numbers."

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        return response.content.strip()
    except Exception:
        return (
            "Analysis complete! I have your verified skill data loaded. "
            "What would you like to explore first — your strongest skills, "
            "skill gaps, or project verification results?"
        )


# =============================================================================
# Coach Report HTML Export
# =============================================================================

def _heatmap_severity_color(severity: str) -> str:
    return {
        "Critical": "#ef4444",
        "Moderate": "#f59e0b",
        "Minor": "#3b82f6",
        "None": "#22c55e",
    }.get(severity, "#94a3b8")


def _score_bar(score: int) -> str:
    color = "#22c55e" if score >= 70 else "#f59e0b" if score >= 40 else "#ef4444"
    return (
        f'<div style="display:flex;align-items:center;gap:6px">'
        f'<div style="flex:1;background:#e2e8f0;border-radius:4px;height:6px">'
        f'<div style="width:{score}%;background:{color};height:6px;border-radius:4px"></div></div>'
        f'<span style="font-size:11px;font-weight:700;color:{color}">{score}%</span></div>'
    )


def generate_coach_report_html(
    candidate_name: str,
    gap_summary: str,
    bridge_projects: list[dict],
    heatmap: Optional[dict] = None,
    roadmap: Optional[dict] = None,
) -> str:
    """
    Generate a self-contained downloadable HTML coach report.
    Pattern mirrors generate_ats_html_report() in ats.py.
    """
    # ── Heatmap section ───────────────────────────────────────────────────────
    heatmap_html = ""
    if heatmap and heatmap.get("rows"):
        rows_html = ""
        for row in heatmap["rows"]:
            sev = row.get("gap_severity", "None")
            sc = _heatmap_severity_color(sev)
            ats_icon = "&#x2713;" if row.get("ats_found") else "&#x2717;"
            ats_color = "#22c55e" if row.get("ats_found") else "#ef4444"
            rows_html += (
                f'<tr style="border-bottom:1px solid #f1f5f9">'
                f'<td style="padding:10px 12px;font-weight:600;font-size:13px">{row.get("skill","")}</td>'
                f'<td style="padding:10px 12px;font-size:12px;color:#64748b">{row.get("category","")}</td>'
                f'<td style="padding:10px 12px;text-align:center;font-weight:700;color:{ats_color}">{ats_icon}</td>'
                f'<td style="padding:10px 12px;min-width:120px">{_score_bar(row.get("verified_score",0))}</td>'
                f'<td style="padding:10px 12px"><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:{sc}22;color:{sc}">{sev}</span></td>'
                f'<td style="padding:10px 12px;font-size:12px;color:#475569">{row.get("recommendation","")}</td>'
                f'</tr>'
            )
        overall = heatmap.get("overall_match_pct", 0)
        crit = heatmap.get("critical_count", 0)
        mod = heatmap.get("moderate_count", 0)
        heatmap_html = (
            f'<div class="card"><p class="section-title">&#x1F4CA; JD Skills Gap Heatmap</p>'
            f'<div style="display:flex;gap:12px;margin-bottom:16px">'
            f'<div style="padding:8px 16px;background:#ede9fe;border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#7c3aed">{overall}%</div><div style="font-size:11px;color:#6d28d9;font-weight:600">Code Match</div></div>'
            f'<div style="padding:8px 16px;background:#fee2e2;border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#dc2626">{crit}</div><div style="font-size:11px;color:#b91c1c;font-weight:600">Critical</div></div>'
            f'<div style="padding:8px 16px;background:#fef3c7;border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#d97706">{mod}</div><div style="font-size:11px;color:#b45309;font-weight:600">Moderate</div></div>'
            f'</div>'
            f'<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8fafc">'
            f'<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Skill</th>'
            f'<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Category</th>'
            f'<th style="padding:10px 12px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase">In Resume</th>'
            f'<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Code Score</th>'
            f'<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Gap</th>'
            f'<th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Tip</th>'
            f'</tr></thead><tbody>{rows_html}</tbody></table></div>'
        )

    # ── Bridge projects ────────────────────────────────────────────────────────
    projects_html = ""
    for proj in bridge_projects:
        steps_html = "".join(f"<li style='margin-bottom:4px'>{s}</li>" for s in proj.get("steps", []))
        outcomes_html = "".join(f"<li style='margin-bottom:4px;color:#166534'>{o}</li>" for o in proj.get("learning_outcomes", []))
        tech_badges = "".join(
            f'<span style="display:inline-block;margin:2px;padding:2px 9px;background:#ede9fe;color:#5b21b6;border-radius:20px;font-size:11px;font-weight:600">{t}</span>'
            for t in proj.get("tech_stack", [])
        )
        diff = proj.get("difficulty", "Intermediate")
        diff_color = "#22c55e" if diff == "Beginner" else "#f59e0b" if diff == "Intermediate" else "#ef4444"
        gain = proj.get("estimated_score_gain", 0)
        gain_badge = f'<span style="margin-left:8px;font-size:11px;background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:20px;font-weight:600">+{gain}% match boost</span>' if gain else ""
        projects_html += (
            f'<div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0">'
            f'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">'
            f'<div><span style="font-size:11px;font-weight:700;text-transform:uppercase;color:#7c3aed">Bridge Project #{proj.get("rank",1)} &#x2014; {proj.get("gap_skill","")}</span>{gain_badge}'
            f'<h3 style="font-size:16px;font-weight:700;margin:4px 0">{proj.get("project_title","")}</h3></div>'
            f'<span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;background:{diff_color}22;color:{diff_color}">{diff}</span></div>'
            f'<p style="font-size:13px;color:#475569;margin-bottom:10px">{proj.get("description","")}</p>'
            f'<div style="margin-bottom:10px">{tech_badges}</div>'
            f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
            f'<div><p style="font-size:12px;font-weight:700;margin-bottom:6px">Steps</p><ol style="padding-left:16px;font-size:12px;color:#475569;line-height:1.6">{steps_html}</ol></div>'
            f'<div><p style="font-size:12px;font-weight:700;margin-bottom:6px">Learning Outcomes</p><ul style="padding-left:16px;font-size:12px;line-height:1.6">{outcomes_html}</ul></div>'
            f'</div></div>'
        )

    # ── Roadmap section ────────────────────────────────────────────────────────
    roadmap_html = ""
    if roadmap and roadmap.get("weeks"):
        weeks_html = ""
        for w in roadmap["weeks"]:
            tasks_html = "".join(f"<li style='margin-bottom:4px'>{t}</li>" for t in w.get("tasks", []))
            weeks_html += (
                f'<div style="min-width:200px;background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;flex-shrink:0">'
                f'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#7c3aed;margin-bottom:4px">Week {w.get("week","")}</div>'
                f'<div style="font-size:14px;font-weight:700;margin-bottom:10px">{w.get("focus_skill","")}</div>'
                f'<ul style="padding-left:14px;font-size:12px;color:#475569;margin-bottom:10px">{tasks_html}</ul>'
                f'<div style="font-size:11px;background:#d1fae5;color:#065f46;padding:6px 10px;border-radius:8px">&#x2705; {w.get("milestone","")}</div>'
                f'<div style="font-size:10px;color:#94a3b8;margin-top:6px">~{w.get("hours_required","")}h</div>'
                f'</div>'
            )
        total_w = roadmap.get("total_weeks", len(roadmap["weeks"]))
        readiness = roadmap.get("readiness_date", f"~{total_w} weeks")
        roadmap_html = (
            f'<div class="card"><p class="section-title">&#x1F5FA; Learning Roadmap</p>'
            f'<div style="font-size:13px;color:#64748b;margin-bottom:14px">{total_w} weeks &middot; {roadmap.get("total_hours","")} total hours &middot; Ready {readiness}</div>'
            f'<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">{weeks_html}</div></div>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Career Coach Report &mdash; {candidate_name}</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b}}
  .container{{max-width:980px;margin:0 auto;padding:40px 24px}}
  .header{{background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;border-radius:16px;padding:32px;margin-bottom:28px}}
  .header h1{{font-size:26px;margin-bottom:6px}}
  .gap-box{{background:linear-gradient(135deg,#ede9fe,#f0fdf4);border:1px solid #ddd6fe;border-radius:12px;padding:20px;margin-bottom:20px}}
  .section-title{{font-size:18px;font-weight:700;margin-bottom:14px;color:#1e293b}}
  .card{{background:white;border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
  .footer{{text-align:center;margin-top:40px;font-size:13px;color:#94a3b8}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#x1F3AF; Career Coach Report</h1>
    <div style="opacity:.85;font-size:14px">Candidate: <strong>{candidate_name}</strong> &nbsp;|&nbsp; Generated by TrueSkill AI</div>
  </div>
  <div class="gap-box">
    <div style="font-weight:700;margin-bottom:8px;color:#7c3aed">&#x1F4CB; Gap Analysis Summary</div>
    <p style="color:#374151;line-height:1.6;font-size:13px">{gap_summary}</p>
  </div>
  {heatmap_html}
  <div class="card"><p class="section-title">&#x1F680; Bridge Projects</p>{projects_html}</div>
  {roadmap_html}
  <div class="footer">Generated by TrueSkill AI &mdash; Career Coach Engine</div>
</div>
</body>
</html>"""


# =============================================================================
# Mock Interview — Models & Functions
# =============================================================================

class InterviewQuestion(BaseModel):
    """A single mock interview question."""
    index: int
    question: str
    type: str = Field(description="behavioral | technical | system_design | situational")
    skill_tags: list[str] = Field(description="Skills this question probes")
    difficulty: str = Field(description="Easy | Medium | Hard")
    expected_answer_hint: str = Field(description="What a strong answer covers — shown AFTER grading")


class AnswerFeedback(BaseModel):
    """Feedback for one interview answer."""
    question_index: int
    score: int = Field(ge=0, le=10, description="0-10 rating")
    verdict: str = Field(description="Strong | Good | Needs Work | Weak")
    strengths: list[str]
    improvements: list[str]
    code_evidence_reference: str = Field(description="Specific file/function from their code that supports or contradicts the answer")
    model_answer_excerpt: str = Field(description="2-3 sentence example of a strong answer")


async def generate_mock_interview_questions(
    verified_skills: list[VerifiedSkill],
    job_description: str,
    gap_summary: str = "",
    num_questions: int = 6,
) -> list[InterviewQuestion]:
    """
    Generate calibrated mock interview questions for the candidate.
    Questions target their verified skill levels + the JD's requirements.
    Strong skills get depth questions; gap areas get gap-probing questions.
    """
    num_questions = max(3, min(8, num_questions))
    llm = get_llm_model(temperature=0.5)

    skills_context = "\n".join(
        f"  - {s.topic}: {s.score}% ({s.status})"
        for s in verified_skills
    ) or "  (no skills verified yet)"

    system_prompt = f"""You are a senior technical interviewer at a top-tier tech company.
Generate exactly {num_questions} interview questions calibrated to this specific candidate.

RULES:
- Mix types: 2-3 technical deep-dives, 1-2 behavioral/situational, 1 system design, 1 gap-probing
- Technical questions should probe their VERIFIED strong skills at depth (not trivial)
- Gap-probing questions expose their weakest/missing skills relevant to the JD
- System design question must match the JD's seniority level (senior = distributed systems scale)
- Each question must have 2-4 skill_tags matching actual skills from their profile
- difficulty: "Easy" only for warm-up Q1, rest "Medium" or "Hard"

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "index": 1,
      "question": "full question text",
      "type": "technical|behavioral|system_design|situational",
      "skill_tags": ["skill1", "skill2"],
      "difficulty": "Medium",
      "expected_answer_hint": "A strong answer would mention X, Y, Z"
    }}
  ]
}}"""

    human_prompt = f"""CANDIDATE VERIFIED SKILLS:
{skills_context}

GAP SUMMARY: {gap_summary or '(not generated yet)'}

TARGET JOB DESCRIPTION (excerpt):
---
{job_description[:3000]}
---

Generate {num_questions} calibrated interview questions. Return only valid JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        data = parse_json_response(response.content)
        questions_raw = data.get("questions", [])
        questions: list[InterviewQuestion] = []
        for i, q in enumerate(questions_raw[:num_questions]):
            questions.append(InterviewQuestion(
                index=int(q.get("index", i + 1)),
                question=q.get("question", ""),
                type=q.get("type", "technical"),
                skill_tags=q.get("skill_tags", []),
                difficulty=q.get("difficulty", "Medium"),
                expected_answer_hint=q.get("expected_answer_hint", ""),
            ))
        return questions
    except Exception as e:
        raise ValueError(f"Mock interview question generation failed: {e}")


async def grade_interview_answer(
    question: dict,
    answer: str,
    verified_skills: list[VerifiedSkill],
) -> AnswerFeedback:
    """
    Grade one interview answer against the candidate's verified code evidence.
    References specific skills/scores to give grounded, personalized feedback.
    """
    llm = get_llm_model(temperature=0.3)

    skill_context = "\n".join(
        f"  - {s.topic}: {s.score}% ({s.status})"
        for s in verified_skills
    ) or "  (no skills verified)"

    system_prompt = """You are a senior technical interviewer grading a mock interview answer.
Grade honestly — a mediocre answer gets 4-6, not 8+. Be specific.
Cite their actual verified code scores when relevant.

Return ONLY valid JSON:
{
  "score": <0-10>,
  "verdict": "Strong|Good|Needs Work|Weak",
  "strengths": ["specific strength 1", "specific strength 2"],
  "improvements": ["specific improvement 1", "specific improvement 2"],
  "code_evidence_reference": "Their code shows X at Y%, which supports/contradicts this answer because...",
  "model_answer_excerpt": "A strong answer would say: ..."
}"""

    human_prompt = f"""INTERVIEW QUESTION:
Type: {question.get('type', 'technical')}
Question: {question.get('question', '')}
Expected to cover: {question.get('expected_answer_hint', '')}

CANDIDATE'S ANSWER:
{answer[:2000]}

CANDIDATE'S VERIFIED SKILL SCORES (for grounding feedback):
{skill_context}

Grade this answer. Return only valid JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        data = parse_json_response(response.content)
        return AnswerFeedback(
            question_index=question.get("index", 1),
            score=max(0, min(10, int(data.get("score", 5)))),
            verdict=data.get("verdict", "Needs Work"),
            strengths=data.get("strengths", []),
            improvements=data.get("improvements", []),
            code_evidence_reference=data.get("code_evidence_reference", ""),
            model_answer_excerpt=data.get("model_answer_excerpt", ""),
        )
    except Exception as e:
        raise ValueError(f"Answer grading failed: {e}")


# =============================================================================
# Resume Tailoring — Models & Function
# =============================================================================

class TailoredBullet(BaseModel):
    original: str
    tailored: str
    keywords_added: list[str] = Field(description="JD keywords woven in")
    overclaim_warning: Optional[str] = Field(default=None, description="Set if bullet references an Unverified skill")


class TailoredResumeResult(BaseModel):
    tailored_bullets: list[TailoredBullet]
    summary_rewrite: str = Field(description="Rewritten professional summary targeting the JD")
    skills_section: str = Field(description="Suggested skills section keywords matching JD")
    overclaim_count: int
    jd_keyword_coverage_pct: int = Field(description="% of key JD skills now present in tailored resume")


async def generate_tailored_resume(
    resume_text: str,
    verified_skills: list[VerifiedSkill],
    job_description: str,
) -> TailoredResumeResult:
    """
    Rewrite resume bullets to match the JD while staying truthful.
    Flags bullets that reference Unverified skills (overclaims).
    """
    llm = get_llm_model(temperature=0.4)

    # Build verified/unverified lookup
    verified_topics = {s.topic.lower(): s.status for s in verified_skills}
    strong = [s.topic for s in verified_skills if s.score >= 70]
    unverified_topics = [s.topic for s in verified_skills if s.status == "Unverified"]

    system_prompt = """You are an expert technical resume writer AND an engineering honesty enforcer.

TASK: Rewrite the candidate's resume bullets to:
1. Match the language and keywords of the target job description
2. Lead with the candidate's STRONGEST verified skills (score >= 70%)
3. Naturally integrate JD-required technology names where the candidate genuinely has experience
4. Flag any bullet that overclaims an Unverified skill with an overclaim_warning

RULES — CRITICAL:
- NEVER invent experience the candidate doesn't have
- If a JD keyword maps to an Unverified skill, do NOT add it to a tailored bullet — instead set overclaim_warning
- Bullets should be concise, quantified where possible, action-verb first
- Keep each bullet under 120 characters

Return ONLY valid JSON:
{
  "tailored_bullets": [
    {
      "original": "original bullet text",
      "tailored": "rewritten bullet targeting JD",
      "keywords_added": ["keyword1", "keyword2"],
      "overclaim_warning": null
    }
  ],
  "summary_rewrite": "Rewritten 2-3 sentence professional summary targeting this role",
  "skills_section": "Python, FastAPI, PostgreSQL, ... (comma-separated, JD-optimized)",
  "jd_keyword_coverage_pct": 72
}"""

    human_prompt = f"""RESUME TEXT:
---
{resume_text[:4000]}
---

VERIFIED SKILLS (from real code analysis):
Strong (>=70%): {', '.join(strong) or 'None'}
Unverified: {', '.join(unverified_topics) or 'None'}

TARGET JOB DESCRIPTION:
---
{job_description[:3000]}
---

Rewrite the resume bullets to match the JD. Mark overclaims. Return only valid JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        data = parse_json_response(response.content)
        bullets_raw = data.get("tailored_bullets", [])
        bullets = []
        overclaim_count = 0
        for b in bullets_raw:
            warning = b.get("overclaim_warning") or None
            if warning:
                overclaim_count += 1
            bullets.append(TailoredBullet(
                original=b.get("original", ""),
                tailored=b.get("tailored", ""),
                keywords_added=b.get("keywords_added", []),
                overclaim_warning=warning,
            ))
        return TailoredResumeResult(
            tailored_bullets=bullets,
            summary_rewrite=data.get("summary_rewrite", ""),
            skills_section=data.get("skills_section", ""),
            overclaim_count=overclaim_count,
            jd_keyword_coverage_pct=int(data.get("jd_keyword_coverage_pct", 0)),
        )
    except Exception as e:
        raise ValueError(f"Resume tailoring failed: {e}")


# =============================================================================
# Salary Intelligence — Models & Function
# =============================================================================

class SalaryIntelligence(BaseModel):
    currency: str = "USD"
    low: int
    mid: int
    high: int
    confidence: str = Field(description="High | Medium | Low")
    seniority_detected: str
    location_detected: str
    negotiation_points: list[str] = Field(description="2-3 talking points tied to verified skills")
    disclaimer: str = "AI-estimated based on JD signals. Verify on Glassdoor / Levels.fyi."


async def generate_salary_intelligence(
    job_description: str,
    verified_skills: list[VerifiedSkill],
    location: str = "",
) -> SalaryIntelligence:
    """
    Estimate a salary range from JD signals and the candidate's verified skill depth.
    Returns a range + negotiation talking points grounded in actual code evidence scores.
    """
    llm = get_llm_model(temperature=0.2)

    strong = [s for s in verified_skills if s.score >= 70]
    strong_context = ", ".join(f"{s.topic} ({s.score}%)" for s in strong[:6]) or "None"

    system_prompt = """You are a compensation intelligence analyst. Estimate a salary range from a job description.
Extract: seniority level, location, tech stack rarity, and company type signals.
Then generate 2-3 negotiation talking points using the candidate's strongest verified skills.

Return ONLY valid JSON:
{
  "currency": "USD",
  "low": 120000,
  "mid": 145000,
  "high": 175000,
  "confidence": "Medium",
  "seniority_detected": "Senior Software Engineer",
  "location_detected": "San Francisco, CA",
  "negotiation_points": [
    "Your FastAPI expertise (87% verified) is directly required; argue for the upper band.",
    "..."
  ]
}"""

    human_prompt = f"""JOB DESCRIPTION:
---
{job_description[:3000]}
---

CANDIDATE'S STRONGEST VERIFIED SKILLS: {strong_context}
OVERRIDE LOCATION (if provided): {location or '(detect from JD)'}

Estimate a realistic salary range. Negotiation points must cite specific verified skills.
Return only valid JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        data = parse_json_response(response.content)
        return SalaryIntelligence(
            currency=data.get("currency", "USD"),
            low=int(data.get("low", 0)),
            mid=int(data.get("mid", 0)),
            high=int(data.get("high", 0)),
            confidence=data.get("confidence", "Medium"),
            seniority_detected=data.get("seniority_detected", ""),
            location_detected=data.get("location_detected", location or ""),
            negotiation_points=data.get("negotiation_points", []),
        )
    except Exception as e:
        raise ValueError(f"Salary intelligence generation failed: {e}")


# =============================================================================
# Application Kit — Models & Function
# =============================================================================

class ApplicationKit(BaseModel):
    cover_letter: str
    linkedin_message: str = Field(description="<=300 chars connection request message")
    cold_email_subject: str
    cold_email_body: str
    company_name: str
    role_title: str


async def generate_application_kit(
    candidate_name: str,
    verified_skills: list[VerifiedSkill],
    job_description: str,
    gap_summary: str = "",
    company_name: str = "",
    role_title: str = "",
    hiring_manager_name: str = "",
) -> ApplicationKit:
    """
    Generate a complete application kit: cover letter, LinkedIn outreach, and cold email.
    All outputs are grounded in the candidate's verified skill scores.
    """
    llm = get_llm_model(temperature=0.5)

    strong = [s for s in verified_skills if s.score >= 70]
    strong_context = "\n".join(f"  - {s.topic}: {s.score}%" for s in strong[:8]) or "  (none yet)"
    hm_name = hiring_manager_name or "Hiring Manager"

    system_prompt = f"""You are an expert career strategist writing job application materials.
Generate three documents for this candidate applying to a specific role.

RULES:
- Cover letter: 3 paragraphs. Opening hooks on a specific verified strength. Middle bridges their code-verified skills to the JD. Closing is confident, not desperate.
- LinkedIn message: MAX 300 characters. Personal, specific, non-generic. Reference one concrete verified skill.
- Cold email: Short (5-7 sentences). Subject line is a specific value proposition. Body opens with a concrete achievement grounded in a verified skill.
- NEVER use phrases like "I am a passionate team player" or "I would be a great fit"
- All claims must be grounded in their VERIFIED skills

Return ONLY valid JSON:
{{
  "cover_letter": "...",
  "linkedin_message": "...",
  "cold_email_subject": "...",
  "cold_email_body": "...",
  "company_name": "{company_name}",
  "role_title": "{role_title}"
}}"""

    human_prompt = f"""CANDIDATE: {candidate_name or 'The Candidate'}
COMPANY: {company_name or '(detect from JD)'}
ROLE: {role_title or '(detect from JD)'}
HIRING MANAGER: {hm_name}

CANDIDATE'S VERIFIED STRENGTHS (from real code analysis):
{strong_context}

GAP SUMMARY: {gap_summary or '(not available)'}

TARGET JOB DESCRIPTION:
---
{job_description[:3000]}
---

Write all three application documents. Return only valid JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        data = parse_json_response(response.content)
        return ApplicationKit(
            cover_letter=data.get("cover_letter", ""),
            linkedin_message=data.get("linkedin_message", "")[:300],
            cold_email_subject=data.get("cold_email_subject", ""),
            cold_email_body=data.get("cold_email_body", ""),
            company_name=data.get("company_name", company_name),
            role_title=data.get("role_title", role_title),
        )
    except Exception as e:
        raise ValueError(f"Application kit generation failed: {e}")

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

def _build_coach_context(context_data: dict) -> str:
    """
    Build a clean, structured markdown context block that the LLM can
    reliably parse — much better than a raw JSON blob.
    """
    lines: list[str] = []

    # Candidate verified skills
    skills: list[dict] = context_data.get("verified_skills", [])
    if skills:
        lines.append("### CANDIDATE VERIFIED SKILLS (from real code analysis)")
        for s in skills:
            icon = "✅" if s.get("status") == "Verified" else "⚠️" if s.get("status") == "Partially Verified" else "❌"
            lines.append(f"  {icon} {s.get('topic', '?')}: {s.get('score', 0)}% ({s.get('status', '')})")
        lines.append("")

    # Gap summary
    gap_summary = context_data.get("gap_summary", "")
    if gap_summary:
        lines.append("### GAP ANALYSIS SUMMARY")
        lines.append(gap_summary)
        lines.append("")

    # Bridge projects (concise)
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

    # Learning roadmap (week titles only to save tokens)
    roadmap: Optional[dict] = context_data.get("roadmap")
    if roadmap and roadmap.get("weeks"):
        lines.append("### LEARNING ROADMAP")
        for w in roadmap["weeks"]:
            lines.append(f"  Week {w.get('week')}: {w.get('focus_skill')} — {w.get('milestone', '')}")
        lines.append(f"  Total: {roadmap.get('total_weeks')} weeks, {roadmap.get('total_hours')} hours")
        lines.append("")

    # Job description (first 800 chars)
    jd = context_data.get("job_description", "")
    if jd:
        lines.append("### TARGET JOB DESCRIPTION (excerpt)")
        lines.append(jd[:800] + ("..." if len(jd) > 800 else ""))
        lines.append("")

    return "\n".join(lines).strip()


SYSTEM_PROMPT_COACH = """You are **Alex**, a senior software engineering career coach embedded in TrueSkill AI.
You have access to the candidate's verified skill profile (scores from real static code analysis), their assigned bridge projects, and their learning roadmap.

Your personality: Direct, warm, encouraging but honest. You give concrete, specific advice — never generic platitudes.

OUTPUT RULES (always follow these):
- Use bullet points or numbered lists when listing multiple items
- Bold (**text**) key skill names, project titles, and important numbers
- Keep replies under 200 words unless the user explicitly asks for a detailed breakdown
- Always reference the candidate's actual skill names and scores when relevant
- If you don't have enough context to answer precisely, say so and ask a clarifying question
- End your reply with a single, specific follow-up question that moves the conversation forward

AFTER YOUR REPLY, always output a JSON block (hidden from the user) on the last line:
<!-- suggestions: ["Short follow-up 1?", "Short follow-up 2?", "Short follow-up 3?"] -->
These 3 suggestions must be short (≤8 words each) and directly relevant to what you just said."""


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
    history = history or []

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
    import re as _re
    async for chunk in llm.astream(messages):
        token = chunk.content if hasattr(chunk, 'content') else str(chunk)
        full_text += token
        # Don't stream the hidden suggestions footer
        if '<!--' not in full_text:
            yield f"data: {json.dumps({'token': token})}\n\n"

    # Extract suggestions
    suggestions: list[str] = []
    m = _re.search(r'<!--\s*suggestions:\s*(\[.*?\])\s*-->', full_text, _re.DOTALL)
    if m:
        try:
            suggestions = json.loads(m.group(1))
        except Exception:
            pass
    if not suggestions:
        suggestions = [
            "What should I build first?",
            "How long will this take me?",
            "Which skill gap hurts most?",
        ]

    yield f"data: {json.dumps({'done': True, 'suggestions': suggestions})}\n\n"


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

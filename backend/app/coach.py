"""
Career Coach Module - Gap Analysis & Bridge Project Generator
Compares verified skills against job descriptions and generates learning projects.

Workflow 2 (from project_spec.md):
    Input: VerifiedSkills list vs JobDescription text
    Logic: Identify missing keywords + Identify "weak" verifications (Score < 50)
    Output: List[ProjectSuggestion] (configurable count, default 3)
"""

import os
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage
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

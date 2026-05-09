"""
project_features.py — LLM-powered features for the Projects verification section.

Provides three async functions:
  1. generate_project_interview_questions  — project-scoped interview prep
  2. challenge_project_verdict             — devil's advocate for the full project
  3. explain_missing_bullet               — focused explanation of why a bullet is unsupported
"""

from typing import Any
from langchain_core.messages import SystemMessage, HumanMessage
from .llm import get_llm_model, parse_json_response


# ─── 1. Project Interview Questions ──────────────────────────────────────────

_INTERVIEW_SYSTEM = """\
You are a senior engineering interviewer at a FAANG-tier company.
You are given details of a candidate's project from their resume, including:
  - The project name, tech stack, and resume bullet claims
  - The actual code evidence found in their GitHub repository

Your task: generate highly personalised, probing interview questions that test whether
the candidate genuinely built and understands this project — not generic questions.

RULES:
- Reference SPECIFIC evidence: name actual functions, files, or modules found in the repo.
- Cover: architecture decisions, tech choice rationale, failure handling, scalability.
- Mix difficulty: Easy (warm-up), Medium (depth), Hard (expert probe).
- For Hard questions, include a follow-up that goes deeper.
- Do NOT generate textbook questions unrelated to their specific code.

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "level": "Easy|Medium|Hard",
      "question": "<specific question referencing their project>",
      "expected_answer_hint": "<what a strong answer covers in 1-2 sentences>",
      "why_this_question": "<1 sentence: what this probes about the candidate>"
    }
  ],
  "interviewer_note": "<2-3 sentence summary: what to focus on for this specific project>"
}"""


async def generate_project_interview_questions(
    project_name: str,
    tech_stack: list[str],
    bullet_claims: list[str],
    all_evidence_node_ids: list[str],
    reasoning: str,
    matched_repo_name: str,
    num_questions: int = 6,
) -> dict[str, Any]:
    """Generate personalised interview questions for a verified project."""
    num_questions = max(4, min(8, num_questions))
    llm = get_llm_model(temperature=0.5)

    evidence_str = "\n".join(f"  - {nid}" for nid in all_evidence_node_ids[:20]) \
                   or "  (no specific code evidence found)"
    bullets_str = "\n".join(f"  • {b}" for b in bullet_claims[:8])
    tech_str = ", ".join(tech_stack)

    human = f"""Generate {num_questions} personalised interview questions for this project.

PROJECT: {project_name}
MATCHED REPO: {matched_repo_name}
TECH STACK: {tech_str}

RESUME BULLET CLAIMS:
{bullets_str}

CODE EVIDENCE FOUND IN REPO:
{evidence_str}

VERIFICATION REASONING:
{reasoning or "(not available)"}

Generate {num_questions} questions — mix Easy, Medium, and Hard.
Make them SPECIFIC to this project's code and architecture claims.
Return only the JSON."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_INTERVIEW_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        questions = [
            {
                "level": q.get("level", "Medium"),
                "question": q.get("question", ""),
                "expected_answer_hint": q.get("expected_answer_hint", ""),
                "why_this_question": q.get("why_this_question", ""),
            }
            for q in data.get("questions", [])[:num_questions]
            if isinstance(q, dict) and q.get("question")
        ]
        return {
            "project": project_name,
            "questions": questions,
            "interviewer_note": data.get("interviewer_note", ""),
            "num_generated": len(questions),
        }
    except Exception as e:
        return {"project": project_name, "questions": [], "interviewer_note": "", "num_generated": 0, "error": str(e)}


# ─── 2. Project Devil's Advocate ─────────────────────────────────────────────

_CHALLENGE_SYSTEM = """\
You are a sceptical, experienced technical hiring manager reviewing a candidate's project claim.
Your job is to argue AGAINST the verification verdict — identify weaknesses, gaps, and overstatements.
Be specific: name the exact gaps in evidence, missing architectural patterns, and weak claims.
Describe what a truly senior engineer's project repo would show.
Keep your challenge under 200 words. Be direct and professional — incisive, not rude.
Do NOT repeat the original verdict. Start immediately with the challenge."""


async def challenge_project_verdict(
    project_name: str,
    tech_stack: list[str],
    status: str,
    overall_score: int,
    tech_coverage_score: int,
    architecture_score: int,
    claim_support_score: int,
    reasoning: str,
    bullet_verdicts: list[dict],
    match_confidence: float,
) -> str:
    """Generate an adversarial challenge to a project verification verdict."""
    llm = get_llm_model(temperature=0.6)

    supported   = [v["claim"] for v in bullet_verdicts if v.get("supported")]
    unsupported = [v["claim"] for v in bullet_verdicts if not v.get("supported")]
    tech_str    = ", ".join(tech_stack)

    human = f"""\
PROJECT: {project_name}
TECH STACK: {tech_str}
VERDICT: {status} (score: {overall_score}/100)
MATCH CONFIDENCE: {int(match_confidence * 100)}%

SCORE BREAKDOWN:
  - Tech Stack Coverage:      {tech_coverage_score}/40
  - Architecture Assessment:  {architecture_score}/35
  - Claim Support:            {claim_support_score}/25

SUPPORTED BULLETS ({len(supported)}):
{chr(10).join("  • " + b for b in supported[:5]) or "  (none)"}

UNSUPPORTED BULLETS ({len(unsupported)}):
{chr(10).join("  • " + b for b in unsupported[:5]) or "  (none)"}

VERIFICATION REASONING:
{reasoning}

Now argue why this verdict is WRONG or overly generous.
Name specific missing evidence, weak architectural signals, and what a senior engineer's repo would contain.
"""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_CHALLENGE_SYSTEM), HumanMessage(content=human)])
        return resp.content.strip()
    except Exception as e:
        return f"Could not generate challenge: {e}"


# ─── 3. Explain Missing Bullet ───────────────────────────────────────────────

_EXPLAIN_SYSTEM = """\
You are a senior software engineer and technical recruiter.
A resume bullet claim could not be verified in the candidate's GitHub repository.
Your task: explain in 3-5 concrete sentences:
  1. WHY this claim is hard to verify from code alone
  2. WHAT specific code artifacts (files, functions, patterns, config) would prove this claim
  3. WHAT the candidate should add to their repo to make this claim verifiable

Be specific and constructive. Reference the project's tech stack and repo name.
Keep under 120 words."""


async def explain_missing_bullet(
    project_name: str,
    bullet_claim: str,
    tech_stack: list[str],
    matched_repo_name: str,
    missing_evidence_hint: str,
) -> str:
    """Explain why a specific bullet claim is unsupported and what would fix it."""
    llm = get_llm_model(temperature=0.4)

    human = f"""\
PROJECT: {project_name}
REPO: {matched_repo_name}
TECH STACK: {", ".join(tech_stack)}

UNVERIFIED BULLET CLAIM:
  "{bullet_claim}"

EXISTING HINT (if any): {missing_evidence_hint or "(none)"}

Explain:
1. Why this claim is hard to verify from code
2. What specific files/functions/patterns would prove it
3. What the candidate should add to make it verifiable
Keep under 120 words."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_EXPLAIN_SYSTEM), HumanMessage(content=human)])
        return resp.content.strip()
    except Exception as e:
        return f"Could not generate explanation: {e}"

"""
Resume Optimizer Module — AI Resume Toolkit
============================================
Provides:
  1. optimize_resume_keywords() — Rewrites the skills/summary to inject missing ATS keywords
  2. draft_outreach_email()     — Generates a personalized cold outreach email

Uses the shared Groq/Llama LLM from llm.py.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from .llm import get_llm_model, parse_json_response


# =============================================================================
# Data Models
# =============================================================================

class OptimizationResult(BaseModel):
    original_skills_section: str = ""
    optimized_skills_section: str = ""
    injected_keywords: list[str] = Field(default_factory=list)
    changes_summary: str = ""
    optimization_tip: str = ""


class EmailDraft(BaseModel):
    subject: str = ""
    body: str = ""
    tone: str = "Professional"
    word_count: int = 0


# =============================================================================
# ATS Keyword Optimizer
# =============================================================================

_OPTIMIZER_SYSTEM_PROMPT = """You are a professional resume writer specializing in ATS (Applicant Tracking System) optimization.

Your task is to rewrite the Skills and Summary sections of a resume to naturally incorporate missing keywords from a job description.

Rules:
- Keep the tone professional and authentic — do NOT fabricate experience the candidate doesn't have
- Incorporate keywords naturally, not as a keyword dump
- Preserve the candidate's actual skills — only ADD or REPHRASE, never remove
- Focus on the Skills section (and optionally the Summary/Objective section)
- Each keyword must appear in a contextual, meaningful way

Return ONLY valid JSON in this exact structure:
{
  "original_skills_section": "<extract the skills/summary paragraph or bullet list from the resume>",
  "optimized_skills_section": "<fully rewritten skills and/or summary section with keywords naturally integrated>",
  "injected_keywords": ["keyword1", "keyword2", "keyword3"],
  "changes_summary": "One sentence explaining the main changes made",
  "optimization_tip": "One actionable tip for the candidate to further improve their resume"
}"""


async def optimize_resume_keywords(
    resume_text: str,
    job_description: str,
    missing_keywords: list[str],
) -> OptimizationResult:
    """
    Rewrite the Skills/Summary section to inject missing ATS keywords.

    Args:
        resume_text: Full resume text extracted from PDF.
        job_description: The target job description.
        missing_keywords: List of keywords identified as missing (from ATS score).

    Returns:
        OptimizationResult with before/after sections and injected keyword list.
    """
    llm = get_llm_model(temperature=0.3)

    keywords_str = ", ".join(missing_keywords[:20]) if missing_keywords else "See job description"

    human_prompt = f"""RESUME:
---
{resume_text[:6000]}
---

JOB DESCRIPTION:
---
{job_description[:3000]}
---

MISSING KEYWORDS TO INJECT: {keywords_str}

Rewrite the Skills and/or Summary sections to naturally incorporate these missing keywords while preserving authenticity.
Return the JSON report."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=_OPTIMIZER_SYSTEM_PROMPT),
            HumanMessage(content=human_prompt),
        ])
        raw = parse_json_response(response.content)

        return OptimizationResult(
            original_skills_section=raw.get("original_skills_section", ""),
            optimized_skills_section=raw.get("optimized_skills_section", ""),
            injected_keywords=raw.get("injected_keywords", []),
            changes_summary=raw.get("changes_summary", ""),
            optimization_tip=raw.get("optimization_tip", ""),
        )
    except Exception as e:
        return OptimizationResult(
            original_skills_section="",
            optimized_skills_section=f"Optimization failed: {str(e)}",
            injected_keywords=[],
            changes_summary="An error occurred during optimization.",
            optimization_tip="Please try again.",
        )


# =============================================================================
# Cold Email Drafter
# =============================================================================

_EMAIL_SYSTEM_PROMPT = """You are an expert career coach who writes highly effective, personalized cold outreach emails for job applications.

Your email must:
1. Be **concise** (150-200 words TOTAL for the body, 3 short paragraphs)
2. **Paragraph 1** — Personalized opening: mention the specific role, company, and one compelling reason you're excited about THIS company (not generic)
3. **Paragraph 2** — Your value proposition: 1-2 concrete achievements from the resume that are directly relevant to the job description
4. **Paragraph 3** — Clear, confident CTA: ask for a 15-minute call, not "I hope to hear from you"
5. Use the hiring manager's first name in the greeting if provided
6. Subject line must be specific and intriguing (not "Job Application" or "Interested in Role")
7. Tone: professional but warm, confident but not arrogant

Return ONLY valid JSON:
{
  "subject": "<compelling subject line, max 10 words>",
  "body": "<full email body starting with 'Hi [Name],' or 'Dear [Name],'\\n\\nParagraph 1\\n\\nParagraph 2\\n\\nParagraph 3\\n\\nBest,\\n[Candidate Name]>",
  "tone": "Professional"
}"""


async def draft_outreach_email(
    resume_text: str,
    job_posting: dict,
    hiring_manager: dict,
) -> EmailDraft:
    """
    Draft a personalized cold outreach email.

    Args:
        resume_text: Full resume text.
        job_posting: Dict with keys: title, company, location, description.
        hiring_manager: Dict with keys: name, email, title.

    Returns:
        EmailDraft with subject, body, and tone.
    """
    llm = get_llm_model(temperature=0.6)

    manager_name = hiring_manager.get("name", "") or "Hiring Manager"
    first_name = manager_name.split()[0] if manager_name and manager_name != "Hiring Manager" else "Hiring Manager"

    job_title = job_posting.get("title", "the position")
    company = job_posting.get("company", "your company")
    job_desc = job_posting.get("description", "")

    human_prompt = f"""CANDIDATE RESUME (extract relevant achievements):
---
{resume_text[:4000]}
---

JOB POSTING:
Title: {job_title}
Company: {company}
Description: {job_desc[:1500]}
---

HIRING MANAGER:
Name: {manager_name}
First Name: {first_name}
Title: {hiring_manager.get('title', 'Hiring Manager')}
---

Write a compelling, personalized cold outreach email from the candidate to {first_name}.
The email should make them feel like the candidate specifically chose this company, not just mass-applying."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=_EMAIL_SYSTEM_PROMPT),
            HumanMessage(content=human_prompt),
        ])
        raw = parse_json_response(response.content)

        body = raw.get("body", "")
        word_count = len(body.split()) if body else 0

        return EmailDraft(
            subject=raw.get("subject", f"Excited About the {job_title} Role at {company}"),
            body=body,
            tone=raw.get("tone", "Professional"),
            word_count=word_count,
        )
    except Exception as e:
        return EmailDraft(
            subject=f"Application for {job_posting.get('title', 'Open Role')} at {job_posting.get('company', 'Your Company')}",
            body=f"Email drafting failed: {str(e)}\n\nPlease try again.",
            tone="Professional",
            word_count=0,
        )

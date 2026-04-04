"""
ATS Score Module — Applicant Tracking System Evaluation
========================================================
Evaluates a resume against a job description and produces:
  - Overall ATS compatibility score (0-100)
  - Keyword match analysis
  - Section-by-section feedback (Summary, Experience, Skills, Education)
  - Formatting / readability flags
  - Downloadable HTML report generator

Uses the shared Groq/Llama LLM from llm.py — no new dependencies.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from .llm import get_llm_model, parse_json_response


# =============================================================================
# Pydantic Models
# =============================================================================

class KeywordMatch(BaseModel):
    keyword: str
    found: bool
    context: str = ""  # Sentence/phrase where it was found (or empty if missing)


class SectionFeedback(BaseModel):
    section: str           # "Summary" | "Experience" | "Skills" | "Education"
    score: int = Field(ge=0, le=100)
    feedback: str
    suggestions: list[str] = Field(default_factory=list)


class ATSReport(BaseModel):
    ats_score: int = Field(ge=0, le=100, description="Overall ATS compatibility score")
    keyword_match_score: int = Field(ge=0, le=100, description="% of JD keywords found in resume")
    format_score: int = Field(ge=0, le=100, description="Formatting and readability score")
    content_score: int = Field(ge=0, le=100, description="Content quality and completeness")
    keyword_matches: list[KeywordMatch] = Field(default_factory=list)
    section_feedback: list[SectionFeedback] = Field(default_factory=list)
    top_missing_keywords: list[str] = Field(default_factory=list)
    formatting_flags: list[str] = Field(default_factory=list)
    overall_recommendation: str = ""
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


# =============================================================================
# Core Scoring Function
# =============================================================================

SYSTEM_PROMPT = """You are an expert ATS (Applicant Tracking System) analyst and resume coach.
Your task is to evaluate a resume against a job description and produce a detailed, structured report.

You must analyze:
1. **Keyword Match** — Extract every required skill, tool, technology, and qualification from the job description. For EACH one, check whether it appears in the resume (exact match OR clear synonym). Record context snippets where found.
2. **Section Quality** — Evaluate the quality of: Summary/Objective, Work Experience, Skills, and Education sections.
3. **Formatting & Readability** — Flag issues like: no quantified achievements, passive language, missing action verbs, overly long paragraphs, no dates, etc.
4. **Scoring:**
   - `keyword_match_score`: (keywords found / total keywords) * 100, rounded to integer
   - `format_score`: 0-100 based on formatting quality
   - `content_score`: 0-100 based on content quality, relevance, and depth
   - `ats_score`: weighted average = (keyword_match_score * 0.45) + (content_score * 0.35) + (format_score * 0.20), rounded to integer

Return ONLY valid JSON in this exact structure — no markdown, no explanation outside the JSON:
{
  "ats_score": <0-100>,
  "keyword_match_score": <0-100>,
  "format_score": <0-100>,
  "content_score": <0-100>,
  "keyword_matches": [
    {"keyword": "Python", "found": true, "context": "Built data pipelines using Python and Pandas"},
    {"keyword": "Kubernetes", "found": false, "context": ""},
    ...
  ],
  "section_feedback": [
    {
      "section": "Summary",
      "score": <0-100>,
      "feedback": "One-paragraph assessment of this section",
      "suggestions": ["Specific actionable suggestion 1", "Suggestion 2"]
    },
    {
      "section": "Experience",
      "score": <0-100>,
      "feedback": "...",
      "suggestions": [...]
    },
    {
      "section": "Skills",
      "score": <0-100>,
      "feedback": "...",
      "suggestions": [...]
    },
    {
      "section": "Education",
      "score": <0-100>,
      "feedback": "...",
      "suggestions": [...]
    }
  ],
  "top_missing_keywords": ["keyword1", "keyword2", "keyword3"],
  "formatting_flags": [
    "No quantified achievements found in experience section",
    "Missing action verbs — bullets start with job duty descriptions instead of accomplishments"
  ],
  "overall_recommendation": "2-3 sentence executive summary with concrete next steps",
  "strengths": ["Strong point 1", "Strong point 2", "Strong point 3"],
  "improvements": ["Improvement 1", "Improvement 2", "Improvement 3"]
}"""


async def score_resume_ats(resume_text: str, job_description: str) -> ATSReport:
    """
    Run a full ATS evaluation of a resume against a job description.

    Args:
        resume_text: Raw text extracted from the resume PDF.
        job_description: The target job description text.

    Returns:
        ATSReport with all scoring details.
    """
    llm = get_llm_model(temperature=0.1)

    human_prompt = f"""RESUME:
---
{resume_text[:6000]}
---

JOB DESCRIPTION:
---
{job_description[:3000]}
---

Perform a full ATS analysis and return the JSON report."""

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_prompt),
    ])

    raw = parse_json_response(response.content)

    # Build keyword_matches list
    keyword_matches = [
        KeywordMatch(
            keyword=km.get("keyword", ""),
            found=bool(km.get("found", False)),
            context=km.get("context", ""),
        )
        for km in raw.get("keyword_matches", [])
    ]

    # Build section_feedback list
    section_feedback = [
        SectionFeedback(
            section=sf.get("section", ""),
            score=max(0, min(100, int(sf.get("score", 50)))),
            feedback=sf.get("feedback", ""),
            suggestions=sf.get("suggestions", []),
        )
        for sf in raw.get("section_feedback", [])
    ]

    return ATSReport(
        ats_score=max(0, min(100, int(raw.get("ats_score", 0)))),
        keyword_match_score=max(0, min(100, int(raw.get("keyword_match_score", 0)))),
        format_score=max(0, min(100, int(raw.get("format_score", 0)))),
        content_score=max(0, min(100, int(raw.get("content_score", 0)))),
        keyword_matches=keyword_matches,
        section_feedback=section_feedback,
        top_missing_keywords=raw.get("top_missing_keywords", []),
        formatting_flags=raw.get("formatting_flags", []),
        overall_recommendation=raw.get("overall_recommendation", ""),
        strengths=raw.get("strengths", []),
        improvements=raw.get("improvements", []),
    )


# =============================================================================
# HTML Report Generator
# =============================================================================

def _score_color(score: int) -> str:
    if score >= 75:
        return "#22c55e"
    if score >= 50:
        return "#f59e0b"
    return "#ef4444"


def _score_label(score: int) -> str:
    if score >= 75:
        return "Strong"
    if score >= 50:
        return "Fair"
    return "Weak"


def generate_ats_html_report(report: dict[str, Any], candidate_name: str = "Candidate") -> str:
    """
    Generate a self-contained downloadable HTML ATS report.

    Args:
        report: ATSReport as a dict (from ATSReport.model_dump()).
        candidate_name: Name to display in the report header.

    Returns:
        HTML string.
    """
    ats_score = report.get("ats_score", 0)
    kw_score = report.get("keyword_match_score", 0)
    fmt_score = report.get("format_score", 0)
    content_score = report.get("content_score", 0)
    recommendation = report.get("overall_recommendation", "")
    strengths = report.get("strengths", [])
    improvements = report.get("improvements", [])
    formatting_flags = report.get("formatting_flags", [])
    top_missing = report.get("top_missing_keywords", [])
    keyword_matches = report.get("keyword_matches", [])
    section_feedback = report.get("section_feedback", [])

    # Score gauge circle via CSS conic-gradient
    ats_color = _score_color(ats_score)
    ats_label = _score_label(ats_score)

    # Keyword rows
    kw_rows = ""
    for km in keyword_matches:
        found = km.get("found", False)
        status_icon = "✓" if found else "✗"
        status_color = "#22c55e" if found else "#ef4444"
        context = km.get("context", "") or "—"
        kw_rows += f"""
        <tr>
            <td style="padding:9px 14px;font-weight:500">{km.get('keyword','')}</td>
            <td style="padding:9px 14px;text-align:center;color:{status_color};font-weight:700;font-size:16px">{status_icon}</td>
            <td style="padding:9px 14px;color:#64748b;font-size:12px;max-width:320px">{context}</td>
        </tr>"""

    # Section rows
    section_rows = ""
    for sf in section_feedback:
        sc = sf.get("score", 0)
        sc_color = _score_color(sc)
        suggestions_html = "".join(
            f"<li style='margin-bottom:4px'>{s}</li>"
            for s in sf.get("suggestions", [])
        )
        section_rows += f"""
        <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:12px;border:1px solid #e2e8f0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="font-weight:700;font-size:15px">{sf.get('section','')}</span>
                <span style="font-size:22px;font-weight:800;color:{sc_color}">{sc}%</span>
            </div>
            <div style="background:#e2e8f0;border-radius:6px;height:6px;margin-bottom:10px">
                <div style="background:{sc_color};height:6px;border-radius:6px;width:{sc}%"></div>
            </div>
            <p style="color:#475569;font-size:13px;margin-bottom:8px">{sf.get('feedback','')}</p>
            {"<ul style='color:#64748b;font-size:12px;padding-left:18px'>" + suggestions_html + "</ul>" if suggestions_html else ""}
        </div>"""

    # Missing keywords badges
    missing_badges = "".join(
        f"<span style='display:inline-block;margin:3px;padding:3px 10px;background:#fee2e2;color:#b91c1c;border-radius:20px;font-size:12px;font-weight:600'>{k}</span>"
        for k in top_missing
    )

    # Formatting flags
    flags_html = "".join(
        f"<div style='padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;margin-bottom:8px;border-radius:0 6px 6px 0;font-size:13px;color:#92400e'>⚠ {f}</div>"
        for f in formatting_flags
    )

    # Strengths & improvements
    strengths_html = "".join(f"<li style='margin-bottom:5px;color:#166534'>{s}</li>" for s in strengths)
    improvements_html = "".join(f"<li style='margin-bottom:5px;color:#9a3412'>{s}</li>" for s in improvements)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ATS Report — {candidate_name}</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f1f5f9; color:#1e293b; }}
  .container {{ max-width:960px; margin:0 auto; padding:40px 24px; }}
  .header {{ background:linear-gradient(135deg,#4f46e5,#7c3aed); color:white; border-radius:16px; padding:32px; margin-bottom:28px; }}
  .header h1 {{ font-size:26px; margin-bottom:6px; }}
  .header .sub {{ opacity:0.85; font-size:14px; }}
  .score-grid {{ display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; margin-bottom:28px; }}
  .score-card {{ background:white; border-radius:12px; padding:20px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.08); }}
  .score-card .label {{ font-size:12px; color:#64748b; margin-bottom:8px; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }}
  .score-card .value {{ font-size:32px; font-weight:800; }}
  .section-title {{ font-size:18px; font-weight:700; margin-bottom:14px; color:#1e293b; }}
  .card {{ background:white; border-radius:12px; padding:24px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }}
  table {{ width:100%; border-collapse:collapse; }}
  thead tr {{ background:#f8fafc; }}
  th {{ padding:10px 14px; text-align:left; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }}
  tr {{ border-bottom:1px solid #f1f5f9; }}
  tr:last-child {{ border-bottom:none; }}
  .two-col {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
  .rec-box {{ background:linear-gradient(135deg,#ede9fe,#f0fdf4); border:1px solid #ddd6fe; border-radius:12px; padding:20px; margin-bottom:20px; }}
  .footer {{ text-align:center; margin-top:40px; font-size:13px; color:#94a3b8; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🎯 ATS Evaluation Report</h1>
    <div class="sub">Candidate: <strong>{candidate_name}</strong> &nbsp;|&nbsp; Generated by TrueSkill AI</div>
  </div>

  <div class="score-grid">
    <div class="score-card">
      <div class="label">ATS Score</div>
      <div class="value" style="color:{ats_color}">{ats_score}%</div>
      <div style="font-size:12px;color:{ats_color};font-weight:600;margin-top:4px">{ats_label}</div>
    </div>
    <div class="score-card">
      <div class="label">Keyword Match</div>
      <div class="value" style="color:{_score_color(kw_score)}">{kw_score}%</div>
    </div>
    <div class="score-card">
      <div class="label">Content Quality</div>
      <div class="value" style="color:{_score_color(content_score)}">{content_score}%</div>
    </div>
    <div class="score-card">
      <div class="label">Formatting</div>
      <div class="value" style="color:{_score_color(fmt_score)}">{fmt_score}%</div>
    </div>
  </div>

  <div class="rec-box">
    <div style="font-weight:700;margin-bottom:8px;color:#4f46e5">📋 Overall Recommendation</div>
    <p style="color:#374151;line-height:1.6">{recommendation}</p>
  </div>

  <div class="card">
    <p class="section-title">🔑 Keyword Analysis</p>
    {"<div style='margin-bottom:12px'><span style='font-size:13px;font-weight:600;color:#b91c1c'>Top missing keywords: </span>" + missing_badges + "</div>" if missing_badges else ""}
    <table>
      <thead><tr><th>Keyword</th><th style="text-align:center">Found</th><th>Context</th></tr></thead>
      <tbody>{kw_rows}</tbody>
    </table>
  </div>

  <div class="card">
    <p class="section-title">📄 Section Analysis</p>
    {section_rows}
  </div>

  {"<div class='card'><p class='section-title'>⚠ Formatting Flags</p>" + flags_html + "</div>" if flags_html else ""}

  <div class="two-col">
    <div class="card">
      <p class="section-title" style="color:#166534">💪 Strengths</p>
      <ul style="padding-left:18px;line-height:1.7">{strengths_html}</ul>
    </div>
    <div class="card">
      <p class="section-title" style="color:#9a3412">🔧 Areas to Improve</p>
      <ul style="padding-left:18px;line-height:1.7">{improvements_html}</ul>
    </div>
  </div>

  <div class="footer">Generated by TrueSkill AI — ATS Evaluation Engine</div>
</div>
</body>
</html>"""

    return html

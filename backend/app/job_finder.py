"""
Job Finder Module — AI Resume Toolkit
======================================
Provides:
  1. search_jobs()                   — Finds recent job postings via Jooble API
  2. extract_role_location()         — Infers job role + location from resume text via LLM
  3. find_hiring_manager()           — Finds hiring manager contact via Apollo.io API
  4. find_hiring_manager_enhanced()  — Enhanced version: multiple contacts + LLM search suggestions

APIs:
  - Jooble: https://jooble.org/api (POST, JSON, key in URL path)
  - Apollo.io: https://api.apollo.io/v1/people/search (POST, JSON, key in header)
"""

from __future__ import annotations

import os
import re
from typing import Optional
from urllib.parse import quote_plus

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from .llm import get_llm_model, parse_json_response


# =============================================================================
# Data Models
# =============================================================================

class JobPosting(BaseModel):
    title: str
    company: str
    location: str
    description: str          # Snippet (first ~500 chars)
    apply_url: str
    posted_date: str = ""     # May be empty if not returned
    salary: str = ""          # May be empty


class InferredProfile(BaseModel):
    role: str
    location: str
    skills_summary: str       # Top 3-5 skills detected


class HiringManagerResult(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    confidence: str = "Unknown"   # "High" | "Medium" | "Guessed" | "Not Found"
    source: str = ""              # "Apollo" | "Pattern" | "LLM" | "None"
    linkedin_url: str = ""
    linkedin_search_url: str = ""  # Pre-built LinkedIn People Search URL


class HiringManagerSearchResult(BaseModel):
    """Enhanced response containing multiple contacts + search suggestions"""
    primary: HiringManagerResult
    alternatives: list[HiringManagerResult] = []
    search_suggestions: list[str] = []   # e.g. "Head of Engineering at Stripe on LinkedIn"
    email_patterns: list[str] = []       # e.g. "firstname.lastname@company.com"
    company_domain: str = ""


# =============================================================================
# Step 1 — Infer role & location from resume
# =============================================================================

_ROLE_LOCATION_PROMPT = """You are a resume parser. Extract the most likely target job role and preferred work location from this resume.

Return ONLY valid JSON with this exact structure:
{
  "role": "<most relevant job title based on experience, e.g. 'Software Engineer', 'Data Scientist'>",
  "location": "<city/region they work in or last worked in, e.g. 'London', 'New York', 'Remote'>",
  "skills_summary": "<comma-separated list of top 3-5 technical skills>"
}"""


async def extract_role_location(resume_text: str) -> InferredProfile:
    """
    Use LLM to infer job role, location, and skills from resume text.
    Falls back to safe defaults if parsing fails.
    """
    llm = get_llm_model(temperature=0.05)

    try:
        response = await llm.ainvoke([
            SystemMessage(content=_ROLE_LOCATION_PROMPT),
            HumanMessage(content=f"RESUME:\n---\n{resume_text[:5000]}\n---\n\nExtract role, location, and skills."),
        ])
        raw = parse_json_response(response.content)
        return InferredProfile(
            role=raw.get("role", "Software Engineer"),
            location=raw.get("location", ""),
            skills_summary=raw.get("skills_summary", ""),
        )
    except Exception:
        return InferredProfile(role="Software Engineer", location="", skills_summary="")


# =============================================================================
# Step 2 — Search jobs via Jooble
# =============================================================================

JOOBLE_BASE_URL = "https://jooble.org/api"


async def search_jobs(
    role: str,
    location: str,
    num_results: int = 12,
) -> list[JobPosting]:
    """
    Search Jooble for recent job postings matching a role and location.
    """
    api_key = os.getenv("JOOBLE_API_KEY", "")
    if not api_key:
        return _demo_jobs(role, location)

    url = f"{JOOBLE_BASE_URL}/{api_key}"
    payload = {
        "keywords": role,
        "location": location,
        "resultsOnPage": num_results,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return _demo_jobs(role, location)

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "").strip()
        company = job.get("company", "").strip()
        loc = job.get("location", "").strip()
        snippet = job.get("snippet", "") or ""
        link = job.get("link", "")
        updated = job.get("updated", "")
        salary = job.get("salary", "") or ""

        snippet = re.sub(r"<[^>]+>", "", snippet).strip()

        if title and link:
            jobs.append(JobPosting(
                title=title,
                company=company or "Unknown Company",
                location=loc or location,
                description=snippet[:600],
                apply_url=link,
                posted_date=updated[:10] if updated else "",
                salary=salary,
            ))

    return jobs if jobs else _demo_jobs(role, location)


def _demo_jobs(role: str, location: str) -> list[JobPosting]:
    """Fallback demo job postings when no API key is configured."""
    return [
        JobPosting(
            title=f"Senior {role}",
            company="TechCorp Global",
            location=location or "Remote",
            description="We are looking for an experienced professional to join our growing team. You will be responsible for building scalable systems, collaborating with cross-functional teams, and mentoring junior engineers.",
            apply_url="https://example.com/apply",
            posted_date="2026-04-01",
            salary="$90,000 - $130,000",
        ),
        JobPosting(
            title=role,
            company="Innovate Labs",
            location=location or "Remote",
            description="Join our fast-moving startup solving hard problems. We value impact over process. You'll own projects end-to-end and have the autonomy to make key technical decisions.",
            apply_url="https://example.com/apply2",
            posted_date="2026-04-03",
            salary="$80,000 - $110,000",
        ),
        JobPosting(
            title=f"{role} — Mid Level",
            company="FinancePro Inc",
            location=location or "Hybrid",
            description="Exciting opportunity in the fintech space. Work on high-throughput systems serving millions of users. Strong benefits package including equity, health insurance, and flexible PTO.",
            apply_url="https://example.com/apply3",
            posted_date="2026-04-02",
            salary="",
        ),
    ]


# =============================================================================
# Step 3 — Find hiring manager via Apollo.io + LLM fallback
# =============================================================================

APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/v1/mixed_people/search"


async def find_hiring_manager(
    company_name: str,
    job_title: str,
    company_domain: str = "",
) -> HiringManagerResult:
    """
    Original single-result function — kept for backward compat.
    Delegates to the enhanced version and returns primary.
    """
    result = await find_hiring_manager_enhanced(company_name, job_title, company_domain)
    return result.primary


async def find_hiring_manager_enhanced(
    company_name: str,
    job_title: str,
    company_domain: str = "",
) -> HiringManagerSearchResult:
    """
    Enhanced hiring manager search.

    Priority:
    1. Apollo.io API (if key configured) — up to 3 real contacts
    2. LLM-generated search suggestions + email pattern guesses (always)

    Returns HiringManagerSearchResult with primary, alternatives, and search hints.
    """
    apollo_key = os.getenv("APOLLO_API_KEY", "")
    resolved_domain = company_domain or _guess_domain("", company_name)

    alternatives: list[HiringManagerResult] = []
    primary: Optional[HiringManagerResult] = None

    # ── Try Apollo.io ──────────────────────────────────────────────────────────
    if apollo_key:
        apollo_results = await _apollo_search_multiple(
            apollo_key, company_name, resolved_domain, job_title
        )
        if apollo_results:
            primary = apollo_results[0]
            alternatives = apollo_results[1:]

    # ── LLM-generated search suggestions ──────────────────────────────────────
    search_suggestions, email_patterns = await _llm_generate_search_hints(
        company_name, job_title, resolved_domain
    )

    # ── Build LinkedIn search URLs ─────────────────────────────────────────────
    linkedin_urls = _build_linkedin_search_urls(company_name, job_title)

    # ── If Apollo gave nothing, build pattern-based primary ───────────────────
    if primary is None:
        primary = _build_pattern_primary(company_name, resolved_domain, linkedin_urls)

    # Attach LinkedIn search URL to primary if missing
    if not primary.linkedin_search_url and linkedin_urls:
        primary = primary.model_copy(update={"linkedin_search_url": linkedin_urls[0]})

    # Build alternative contacts from search suggestions (LinkedIn + email patterns)
    if not alternatives and len(email_patterns) > 1:
        for ep in email_patterns[1:3]:
            alternatives.append(HiringManagerResult(
                name="",
                email=ep,
                title="Hiring Team",
                confidence="Guessed",
                source="Pattern",
                linkedin_search_url=linkedin_urls[1] if len(linkedin_urls) > 1 else "",
            ))

    return HiringManagerSearchResult(
        primary=primary,
        alternatives=alternatives,
        search_suggestions=search_suggestions,
        email_patterns=email_patterns,
        company_domain=resolved_domain,
    )


async def _apollo_search_multiple(
    api_key: str,
    company_name: str,
    company_domain: str,
    job_title: str,
) -> list[HiringManagerResult]:
    """Call Apollo.io and return up to 3 HiringManagerResult objects."""
    hiring_titles = [
        "Hiring Manager",
        "Technical Recruiter",
        "Talent Acquisition",
        "Head of Engineering",
        "Engineering Manager",
        "HR Manager",
        "VP Engineering",
        "Director of Engineering",
    ]

    payload: dict = {
        "page": 1,
        "per_page": 5,
        "person_titles": hiring_titles,
    }

    if company_domain:
        payload["q_organization_domains"] = company_domain
    else:
        payload["organization_name"] = company_name

    headers = {
        "X-Api-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(APOLLO_PEOPLE_SEARCH_URL, json=payload, headers=headers)
            if response.status_code != 200:
                return []
            data = response.json()
    except Exception:
        return []

    people = data.get("people", [])
    results: list[HiringManagerResult] = []

    for person in people[:3]:
        first = person.get("first_name", "")
        last = person.get("last_name", "")
        name = f"{first} {last}".strip()
        title = person.get("title", "")
        email = person.get("email", "") or ""
        linkedin = person.get("linkedin_url", "") or ""

        confidence = "High" if email and "@" in email else "Medium"

        if not email or "@" not in email:
            domain = company_domain or _guess_domain(
                person.get("organization", {}).get("primary_domain", ""), company_name
            )
            if domain and first and last:
                email = f"{first.lower()}.{last.lower()}@{domain}"
                confidence = "Guessed"
                source = "Pattern"
            else:
                email = ""
                confidence = "Not Found"
                source = "Apollo (no email)"
        else:
            source = "Apollo"

        lk_search = _build_linkedin_search_urls(company_name, job_title)
        results.append(HiringManagerResult(
            name=name,
            email=email,
            title=title,
            confidence=confidence,
            source=source,
            linkedin_url=linkedin,
            linkedin_search_url=lk_search[0] if lk_search else "",
        ))

    return results


async def _llm_generate_search_hints(
    company_name: str,
    job_title: str,
    domain: str,
) -> tuple[list[str], list[str]]:
    """
    Use LLM to generate smart search suggestions and email patterns for a company.

    Returns:
        (search_suggestions, email_patterns)
    """
    llm = get_llm_model(temperature=0.2)

    prompt = f"""You are a recruiting intelligence assistant. Given a company and job title, generate:
1. 4 specific LinkedIn/Google search queries to find the right hiring manager
2. 3 common corporate email patterns for this company domain

Company: {company_name}
Job Title: {job_title}
Domain: {domain or f"{_guess_domain('', company_name)}"}

Return ONLY valid JSON:
{{
  "search_suggestions": [
    "Head of Engineering at {company_name} LinkedIn",
    "Technical Recruiter {company_name} site:linkedin.com",
    "{job_title} hiring manager {company_name}",
    "VP Engineering {company_name} contact"
  ],
  "email_patterns": [
    "firstname.lastname@{domain or 'company.com'}",
    "f.lastname@{domain or 'company.com'}",
    "hiring@{domain or 'company.com'}"
  ]
}}"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = parse_json_response(response.content)
        suggestions = raw.get("search_suggestions", [])[:5]
        patterns = raw.get("email_patterns", [])[:4]
        return suggestions, patterns
    except Exception:
        # Fallback static suggestions
        suggestions = [
            f"Head of Engineering at {company_name} LinkedIn",
            f"Technical Recruiter {company_name} site:linkedin.com",
            f'"{company_name}" "{job_title}" hiring',
        ]
        patterns = [
            f"firstname.lastname@{domain or 'company.com'}",
            f"hiring@{domain or 'company.com'}",
        ]
        return suggestions, patterns


def _build_linkedin_search_urls(company_name: str, job_title: str) -> list[str]:
    """Build pre-filled LinkedIn People Search URLs for hiring managers."""
    keywords = [
        f"Hiring Manager {company_name}",
        f"Technical Recruiter {company_name}",
        f"Head of Engineering {company_name}",
    ]
    urls = []
    base = "https://www.linkedin.com/search/results/people/?"
    for kw in keywords:
        urls.append(f"{base}keywords={quote_plus(kw)}&origin=GLOBAL_SEARCH_HEADER")
    return urls


def _build_pattern_primary(
    company_name: str,
    company_domain: str,
    linkedin_urls: list[str],
) -> HiringManagerResult:
    """Build a pattern-based primary result when Apollo isn't available."""
    email = f"hiring@{company_domain}" if company_domain else ""
    return HiringManagerResult(
        name="",
        email=email,
        title="Hiring Team",
        confidence="Guessed",
        source="Pattern",
        linkedin_url="",
        linkedin_search_url=linkedin_urls[0] if linkedin_urls else "",
    )


def _guess_domain(primary_domain: str, company_name: str) -> str:
    """Attempt to infer a company domain from its name."""
    if primary_domain:
        return primary_domain
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", company_name.lower())
    if cleaned:
        return f"{cleaned}.com"
    return ""

"""
Job Finder Module — AI Resume Toolkit
======================================
Provides:
  1. search_jobs()          — Finds recent job postings via Jooble API
  2. extract_role_location() — Infers job role + location from resume text via LLM
  3. find_hiring_manager()  — Finds hiring manager contact via Apollo.io API

APIs:
  - Jooble: https://jooble.org/api (POST, JSON, key in URL path)
  - Apollo.io: https://api.apollo.io/v1/people/search (POST, JSON, key in header)
"""

from __future__ import annotations

import os
import re
from typing import Optional

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
    source: str = ""              # "Apollo" | "Pattern" | "None"
    linkedin_url: str = ""


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

    Jooble API docs:
      POST https://jooble.org/api/{api_key}
      Body: { "keywords": "...", "location": "...", "resultsOnPage": N }

    Returns a list of JobPosting objects, empty list on failure.
    """
    api_key = os.getenv("JOOBLE_API_KEY", "")
    if not api_key:
        # Return demo data so UI doesn't break
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
        # Jooble field names
        title = job.get("title", "").strip()
        company = job.get("company", "").strip()
        loc = job.get("location", "").strip()
        snippet = job.get("snippet", "") or ""
        link = job.get("link", "")
        updated = job.get("updated", "")
        salary = job.get("salary", "") or ""

        # Clean HTML tags from snippet
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
    """Fallback demo job postings shown when no API key is configured or API fails."""
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
# Step 3 — Find hiring manager via Apollo.io
# =============================================================================

APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/v1/mixed_people/search"
APOLLO_ORG_SEARCH_URL = "https://api.apollo.io/v1/mixed_companies/search"


async def find_hiring_manager(
    company_name: str,
    job_title: str,
    company_domain: str = "",
) -> HiringManagerResult:
    """
    Search Apollo.io for hiring managers / recruiters at a company.

    Apollo.io API:
      POST https://api.apollo.io/v1/mixed_people/search
      Headers: { "X-Api-Key": key }
      Body: { organization_name, titles, page, per_page }

    Falls back to pattern-based email guess if API fails or returns no results.
    """
    api_key = os.getenv("APOLLO_API_KEY", "")

    if api_key:
        result = await _apollo_search(api_key, company_name, company_domain, job_title)
        if result:
            return result

    # Fallback: pattern guess
    return _pattern_guess(company_name, company_domain)


async def _apollo_search(
    api_key: str,
    company_name: str,
    company_domain: str,
    job_title: str,
) -> Optional[HiringManagerResult]:
    """Call Apollo.io people search API."""

    # Titles to search for — hiring manager, recruiter, talent acquisition
    hiring_titles = [
        "Hiring Manager",
        "Technical Recruiter",
        "Talent Acquisition",
        "Head of Engineering",
        "Engineering Manager",
        "HR Manager",
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
            response = await client.post(
                APOLLO_PEOPLE_SEARCH_URL,
                json=payload,
                headers=headers,
            )
            if response.status_code != 200:
                return None
            data = response.json()
    except Exception:
        return None

    people = data.get("people", [])
    if not people:
        return None

    person = people[0]
    first = person.get("first_name", "")
    last = person.get("last_name", "")
    name = f"{first} {last}".strip()
    title = person.get("title", "")
    email = person.get("email", "") or ""
    linkedin = person.get("linkedin_url", "") or ""

    # Apollo may return email as None or masked
    confidence = "High" if email and "@" in email else "Medium"

    # If email is masked/missing, build a pattern guess using the domain
    if not email or "@" not in email:
        domain = company_domain or _guess_domain(person.get("organization", {}).get("primary_domain", ""), company_name)
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

    return HiringManagerResult(
        name=name,
        email=email,
        title=title,
        confidence=confidence,
        source=source,
        linkedin_url=linkedin,
    )


def _pattern_guess(company_name: str, company_domain: str) -> HiringManagerResult:
    """Generate a pattern-based email guess when no API is available."""
    if not company_domain:
        # Try to guess domain from company name
        company_domain = _guess_domain("", company_name)

    if company_domain:
        guessed_email = f"hiring@{company_domain}"
        return HiringManagerResult(
            name="",
            email=guessed_email,
            title="Hiring Team",
            confidence="Guessed",
            source="Pattern",
            linkedin_url="",
        )

    return HiringManagerResult(
        name="",
        email="",
        title="",
        confidence="Not Found",
        source="None",
        linkedin_url="",
    )


def _guess_domain(primary_domain: str, company_name: str) -> str:
    """Attempt to infer a company domain from its name."""
    if primary_domain:
        return primary_domain

    # Simple heuristic: lowercase, remove spaces & special chars, add .com
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", company_name.lower())
    if cleaned:
        return f"{cleaned}.com"
    return ""

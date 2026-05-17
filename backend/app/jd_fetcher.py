"""
JD Fetcher — Career Coach Module
==================================
Fetches and cleans job descriptions from common job board URLs.

Supported sites:
  - Greenhouse  (boards.greenhouse.io)
  - Lever       (jobs.lever.co)
  - Indeed      (indeed.com/viewjob)
  - Ashby       (ashbyhq.com)
  - Workday     (myworkdayjobs.com)
  - LinkedIn    (linkedin.com/jobs) — graceful failure with user hint
  - Generic HTML fallback (BeautifulSoup largest-block extraction)

Usage:
    from .jd_fetcher import fetch_jd_from_url, JDFetchError
    result = await fetch_jd_from_url("https://boards.greenhouse.io/...")
    # result = {"text": "...", "source_site": "greenhouse", "word_count": 342}
"""

from __future__ import annotations

import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup


# =============================================================================
# Custom Error
# =============================================================================

class JDFetchError(Exception):
    """Raised when JD cannot be fetched. Carries a user-friendly message."""
    pass


# =============================================================================
# Constants
# =============================================================================

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_MIN_JD_LENGTH = 200    # chars — shorter = paywall / error page
_MAX_JD_LENGTH = 8000   # chars — trim to keep LLM context manageable


# =============================================================================
# Site-Specific Extractors
# =============================================================================

def _extract_greenhouse(soup: BeautifulSoup) -> str:
    """boards.greenhouse.io / greenhouse.io job pages."""
    for sel in ["#content", ".job-description", ".job__description", "article"]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)
    return ""


def _extract_lever(soup: BeautifulSoup) -> str:
    """jobs.lever.co job pages."""
    for sel in [".content", ".posting-description", "main .section-wrapper", ".posting"]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)
    return ""


def _extract_indeed(soup: BeautifulSoup) -> str:
    """indeed.com job view pages."""
    for sel in [
        "#jobDescriptionText",
        ".jobsearch-JobComponent-description",
        "[data-testid='jobsearch-JobComponent-description']",
        ".job-description",
    ]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)
    return ""


def _extract_ashby(soup: BeautifulSoup) -> str:
    """ashbyhq.com job pages."""
    for sel in [
        ".ashby-job-posting-brief-description",
        "._description_1k63l_1",
        "main article",
        "main section",
        "[class*='description']",
    ]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)
    return ""


def _extract_workday(soup: BeautifulSoup) -> str:
    """myworkdayjobs.com job pages."""
    for sel in [
        "[data-automation-id='jobPostingDescription']",
        "[data-uxi-element='jobPostingDescription']",
        ".WDSTCSS_jobDescription",
    ]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)
    return ""


def _extract_generic(soup: BeautifulSoup) -> str:
    """
    Generic fallback: strip boilerplate, return the largest contiguous text block
    from any div/section/article/main element.
    """
    # Remove structural noise
    for tag in soup(["nav", "header", "footer", "script", "style",
                     "aside", "form", "noscript", "iframe", "button"]):
        tag.decompose()

    # Find the element with the most text
    candidates = soup.find_all(["div", "section", "article", "main"])
    best = ""
    for c in candidates:
        text = c.get_text(separator="\n", strip=True)
        if len(text) > len(best):
            best = text
    return best


# =============================================================================
# Helpers
# =============================================================================

def _clean_text(raw: str) -> str:
    """Normalize whitespace, collapse excessive blank lines."""
    lines = raw.splitlines()
    cleaned: list[str] = []
    prev_blank = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if not prev_blank:
                cleaned.append("")
            prev_blank = True
        else:
            cleaned.append(stripped)
            prev_blank = False
    return "\n".join(cleaned).strip()


def _detect_paywall(html: str, text: str) -> bool:
    """Return True if page looks like a login wall or is too short to be a real JD."""
    html_lower = html.lower()
    paywall_signals = [
        "authwall",
        "sign in to view",
        "please sign in",
        "create an account to view",
        "log in to see",
        "you must be logged in",
        "join now to see",
        "create a free account",
    ]
    for signal in paywall_signals:
        if signal in html_lower:
            return True
    return len(text.strip()) < _MIN_JD_LENGTH


def _classify_site(url: str) -> str:
    """Return a site key from the URL."""
    url_lower = url.lower()
    if "boards.greenhouse.io" in url_lower or "greenhouse.io/jobs" in url_lower:
        return "greenhouse"
    if "jobs.lever.co" in url_lower or "lever.co" in url_lower:
        return "lever"
    if "indeed.com" in url_lower:
        return "indeed"
    if "linkedin.com" in url_lower:
        return "linkedin"
    if "ashbyhq.com" in url_lower:
        return "ashby"
    if "myworkdayjobs.com" in url_lower:
        return "workday"
    return "generic"


# =============================================================================
# Main Entry Point
# =============================================================================

async def fetch_jd_from_url(url: str) -> dict:
    """
    Fetch and extract a job description from a URL.

    Returns:
        {
          "text":        str,   # Cleaned JD text (200–8000 chars)
          "source_site": str,   # "greenhouse" | "lever" | "indeed" | "linkedin" | "ashby" | "workday" | "generic"
          "word_count":  int,
        }

    Raises:
        JDFetchError: with a user-friendly message the frontend can display directly.
    """
    url = url.strip()
    source_site = _classify_site(url)
    is_linkedin = source_site == "linkedin"

    # ── Fetch HTML ────────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(
            headers=_HEADERS,
            timeout=20.0,
            follow_redirects=True,
        ) as client:
            response = await client.get(url)

            if response.status_code == 403:
                if is_linkedin:
                    raise JDFetchError(
                        "LinkedIn blocks automated access — please copy-paste the "
                        "job description into the text area instead."
                    )
                raise JDFetchError(
                    f"Access denied (403). This site blocks automated access. "
                    f"Please copy-paste the job description."
                )

            if response.status_code == 404:
                raise JDFetchError(
                    "Job posting not found (404). The posting may have been removed or the URL is incorrect."
                )

            if response.status_code != 200:
                raise JDFetchError(
                    f"Could not fetch the page (HTTP {response.status_code}). "
                    f"Please check the URL and try again."
                )

            html = response.text

    except httpx.TimeoutException:
        raise JDFetchError(
            "The page took too long to respond. Please try again or copy-paste the job description."
        )
    except httpx.RequestError as exc:
        raise JDFetchError(f"Network error: {exc}. Please check the URL.")
    except JDFetchError:
        raise

    # ── Parse & Extract ───────────────────────────────────────────────────────
    soup = BeautifulSoup(html, "lxml")

    extractor_map = {
        "greenhouse": _extract_greenhouse,
        "lever":      _extract_lever,
        "indeed":     _extract_indeed,
        "ashby":      _extract_ashby,
        "workday":    _extract_workday,
        # linkedin + generic both fall through to generic
    }
    extractor = extractor_map.get(source_site, _extract_generic)
    raw_text = extractor(soup)

    # Always try generic if site-specific gives too little
    if len(raw_text.strip()) < _MIN_JD_LENGTH:
        raw_text = _extract_generic(soup)

    text = _clean_text(raw_text)

    # ── Paywall / Content Check ───────────────────────────────────────────────
    if _detect_paywall(html, text):
        if is_linkedin:
            raise JDFetchError(
                "LinkedIn requires login to view full job descriptions. "
                "Please copy-paste the job description from the posting."
            )
        raise JDFetchError(
            "Could not extract the job description — the page may require login "
            "or the content is behind a paywall. Please copy-paste the description."
        )

    # ── Trim & Return ─────────────────────────────────────────────────────────
    text = text[:_MAX_JD_LENGTH]
    word_count = len(text.split())

    return {
        "text":        text,
        "source_site": source_site,
        "word_count":  word_count,
    }

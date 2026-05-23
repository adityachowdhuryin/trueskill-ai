"""
project_deep_dive.py — Premium AI-powered project analysis for TrueSkill AI.

Provides five async functions powering the "Project Deep Dive" sub-panel:
  1. generate_project_scorecard   — 10-dimension rating (0-10 each, 0-100 aggregate)
  2. generate_project_summary     — What the project is, fetching README if available
  3. generate_tech_debt_radar     — Hotspots, complexity, orphans, quick wins
  4. extract_skill_signals        — Demonstrable skills with evidence strength
  5. generate_recruiter_pitch     — One-click 3-sentence recruiter-ready pitch

All functions use the shared get_llm_model() → primary Nemotron + Groq fallback chain.
Zero new dependencies: httpx and neo4j queries reuse existing patterns.
"""

import os
import base64
import logging
from typing import Any

import httpx
from langchain_core.messages import SystemMessage, HumanMessage

from .llm import get_llm_model, parse_json_response
from .db import query_graph

logger = logging.getLogger(__name__)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _parse_owner_repo(github_url: str) -> tuple[str, str]:
    """Extract (owner, repo) from a GitHub URL. Returns ('', '') on failure."""
    try:
        url = github_url.strip().rstrip("/")
        # Remove protocol
        if "://" in url:
            url = url.split("://", 1)[1]
        parts = url.split("/")
        # parts: ['github.com', 'owner', 'repo']
        if len(parts) >= 3 and "github.com" in parts[0]:
            return parts[1], parts[2].replace(".git", "")
    except Exception:
        pass
    return "", ""


async def _fetch_readme(repo_github_url: str) -> tuple[str, bool]:
    """
    Attempt to fetch README content from the GitHub API.
    Returns (readme_text_truncated, readme_was_found).
    Gracefully returns ('', False) on any error.
    """
    if not repo_github_url:
        return "", False

    owner, repo = _parse_owner_repo(repo_github_url)
    if not owner or not repo:
        return "", False

    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers=headers,
            )
        if resp.status_code != 200:
            return "", False
        data = resp.json()
        encoded = data.get("content", "")
        if not encoded:
            return "", False
        decoded = base64.b64decode(encoded).decode("utf-8", errors="replace")
        # Truncate to 3000 chars to stay within token budget
        return decoded[:3000], True
    except Exception as exc:
        logger.debug("README fetch failed for %s/%s: %s", owner, repo, exc)
        return "", False


def _fetch_repo_complexity_stats(repo_id: str) -> dict:
    """
    Pull complexity stats from Neo4j for use in scorecard and tech-debt functions.
    Returns a dict of stats.
    """
    stats: dict = {
        "avg_complexity": 0.0,
        "max_complexity": 0,
        "orphan_count": 0,
        "file_count": 0,
        "function_count": 0,
        "class_count": 0,
        "import_count": 0,
        "hotspots": [],
        "complexity_buckets": {"1-5": 0, "6-10": 0, "11-20": 0, "21+": 0},
        "top_hubs": [],
        "docstring_ratio": 0.0,
    }
    try:
        # Node type counts
        type_rows = query_graph(
            "MATCH (n) WHERE n.repo_id = $rid RETURN labels(n)[0] AS lbl, count(n) AS cnt",
            {"rid": repo_id},
        )
        for r in type_rows:
            lbl = r.get("lbl", "")
            cnt = r.get("cnt", 0)
            if lbl == "File":
                stats["file_count"] = cnt
            elif lbl == "Function":
                stats["function_count"] = cnt
            elif lbl == "Class":
                stats["class_count"] = cnt
            elif lbl == "Import":
                stats["import_count"] = cnt

        # Complexity stats
        avg_rows = query_graph(
            "MATCH (n) WHERE n.repo_id = $rid AND n.complexity_score IS NOT NULL "
            "RETURN avg(n.complexity_score) AS avg_c, max(n.complexity_score) AS max_c",
            {"rid": repo_id},
        )
        if avg_rows and avg_rows[0].get("avg_c") is not None:
            stats["avg_complexity"] = float(avg_rows[0]["avg_c"])
            stats["max_complexity"] = int(avg_rows[0].get("max_c", 0) or 0)

        # Complexity bucket distribution
        bucket_rows = query_graph(
            "MATCH (n:Function) WHERE n.repo_id = $rid AND n.complexity_score IS NOT NULL "
            "RETURN n.complexity_score AS cs",
            {"rid": repo_id},
        )
        for r in bucket_rows:
            cs = r.get("cs", 0) or 0
            if cs <= 5:
                stats["complexity_buckets"]["1-5"] += 1
            elif cs <= 10:
                stats["complexity_buckets"]["6-10"] += 1
            elif cs <= 20:
                stats["complexity_buckets"]["11-20"] += 1
            else:
                stats["complexity_buckets"]["21+"] += 1

        # Top 5 hotspot functions
        hotspot_rows = query_graph(
            "MATCH (n:Function) WHERE n.repo_id = $rid AND n.complexity_score IS NOT NULL "
            "RETURN n.name AS name, n.file_path AS fp, n.complexity_score AS cs "
            "ORDER BY cs DESC LIMIT 5",
            {"rid": repo_id},
        )
        stats["hotspots"] = [
            {"name": r.get("name", ""), "file": (r.get("fp") or "").split("/")[-1], "complexity": r.get("cs", 0)}
            for r in hotspot_rows
        ]

        # Orphan count
        orphan_rows = query_graph(
            "MATCH (n) WHERE n.repo_id = $rid AND NOT (n)--() RETURN count(n) AS cnt",
            {"rid": repo_id},
        )
        stats["orphan_count"] = orphan_rows[0]["cnt"] if orphan_rows else 0

        # Top hubs (most-connected nodes)
        hub_rows = query_graph(
            "MATCH (n) WHERE n.repo_id = $rid "
            "WITH n, size([(n)-[]-() | 1]) AS deg "
            "ORDER BY deg DESC LIMIT 5 "
            "RETURN n.name AS name, labels(n)[0] AS type, deg AS degree",
            {"rid": repo_id},
        )
        stats["top_hubs"] = [
            {"name": r.get("name", ""), "type": r.get("type", ""), "degree": r.get("degree", 0)}
            for r in hub_rows
        ]

        # Docstring ratio
        if stats["function_count"] > 0:
            doc_rows = query_graph(
                "MATCH (n:Function) WHERE n.repo_id = $rid AND n.docstring IS NOT NULL AND n.docstring <> '' "
                "RETURN count(n) AS cnt",
                {"rid": repo_id},
            )
            doc_count = doc_rows[0]["cnt"] if doc_rows else 0
            stats["docstring_ratio"] = round(doc_count / stats["function_count"], 2)

    except Exception as exc:
        logger.warning("Complexity stats query failed for %s: %s", repo_id, exc)

    return stats


# ─── 1. Project Scorecard ────────────────────────────────────────────────────

_SCORECARD_SYSTEM = """\
You are a world-class technical talent evaluator at a FAANG-tier company.
You are given comprehensive data about a developer's project: resume claims,
verification scores, code graph stats, and tech stack evidence.

Rate the project across EXACTLY 10 dimensions, each scored 0-10.
Be calibrated and honest — not all projects deserve 8s and 9s.
Each score must match its rationale: be specific, reference actual data.

Return ONLY valid JSON (no markdown):
{
  "dimensions": [
    {"name": "Code Complexity Management", "score": <0-10>, "rationale": "<1 sentence with specific evidence>"},
    {"name": "Tech Stack Depth",           "score": <0-10>, "rationale": "<...>"},
    {"name": "Architecture Quality",       "score": <0-10>, "rationale": "<...>"},
    {"name": "Claim Authenticity",         "score": <0-10>, "rationale": "<...>"},
    {"name": "Documentation Quality",     "score": <0-10>, "rationale": "<...>"},
    {"name": "Modularity & Structure",     "score": <0-10>, "rationale": "<...>"},
    {"name": "Dependency Hygiene",         "score": <0-10>, "rationale": "<...>"},
    {"name": "Originality & Ambition",     "score": <0-10>, "rationale": "<...>"},
    {"name": "Resume Impact",              "score": <0-10>, "rationale": "<...>"},
    {"name": "Interview Readiness",        "score": <0-10>, "rationale": "<...>"}
  ],
  "aggregate_score": <sum of all 10 dimension scores>,
  "verdict": "<2-3 sentence executive summary: overall quality, key strength, key gap>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "growth_areas": ["<specific growth area 1>", "<specific growth area 2>"]
}"""


async def generate_project_scorecard(
    project_name: str,
    tech_stack: list[str],
    matched_repo_id: str,
    matched_repo_name: str,
    overall_score: int,
    tech_coverage_score: int,
    architecture_score: int,
    claim_support_score: int,
    reasoning: str,
    bullet_verdicts: list[dict],
    tech_coverage: list[dict],
) -> dict[str, Any]:
    """Generate a 10-dimension project scorecard with aggregate score out of 100."""
    llm = get_llm_model(temperature=0.2)
    stats = _fetch_repo_complexity_stats(matched_repo_id) if matched_repo_id else {}

    supported = [v["claim"] for v in bullet_verdicts if v.get("supported")]
    unsupported = [v["claim"] for v in bullet_verdicts if not v.get("supported")]
    found_techs = [t["tech"] for t in tech_coverage if t.get("found")]
    missing_techs = [t["tech"] for t in tech_coverage if not t.get("found")]

    hotspot_str = "\n".join(
        f"  - {h['name']} in {h['file']} (complexity: {h['complexity']})"
        for h in stats.get("hotspots", [])
    ) or "  (none available)"

    hub_str = ", ".join(
        f"{h['name']} ({h['degree']} connections)"
        for h in stats.get("top_hubs", [])
    ) or "(none)"

    buckets = stats.get("complexity_buckets", {})

    human = f"""Evaluate this project comprehensively and produce a 10-dimension scorecard.

PROJECT: {project_name}
MATCHED REPO: {matched_repo_name or "(none)"}
TECH STACK: {', '.join(tech_stack)}

VERIFICATION SCORES (existing system):
  Overall Score:          {overall_score}/100
  Tech Coverage:          {tech_coverage_score}/40
  Architecture:           {architecture_score}/35
  Claim Support:          {claim_support_score}/25

TECH EVIDENCE:
  Found in repo:    {', '.join(found_techs) or 'none'}
  NOT found:        {', '.join(missing_techs) or 'none'}

RESUME BULLET CLAIMS — SUPPORTED ({len(supported)}):
{chr(10).join('  • ' + b for b in supported[:6]) or '  (none)'}

RESUME BULLET CLAIMS — UNSUPPORTED ({len(unsupported)}):
{chr(10).join('  • ' + b for b in unsupported[:4]) or '  (none)'}

VERIFICATION REASONING:
{reasoning or '(not available)'}

CODE GRAPH STATISTICS:
  Files: {stats.get('file_count', '?')}  |  Functions: {stats.get('function_count', '?')}  |  Classes: {stats.get('class_count', '?')}  |  Imports: {stats.get('import_count', '?')}
  Avg cyclomatic complexity: {stats.get('avg_complexity', 0):.1f}  |  Max: {stats.get('max_complexity', '?')}
  Orphan nodes: {stats.get('orphan_count', '?')}
  Docstring coverage: {int(stats.get('docstring_ratio', 0) * 100)}%
  Complexity distribution — 1-5: {buckets.get('1-5', 0)}  |  6-10: {buckets.get('6-10', 0)}  |  11-20: {buckets.get('11-20', 0)}  |  21+: {buckets.get('21+', 0)}

TOP COMPLEXITY HOTSPOTS:
{hotspot_str}

ARCHITECTURAL HUBS (most-connected nodes):
{hub_str}

Now produce the 10-dimension scorecard JSON. Be calibrated and honest."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_SCORECARD_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        # Validate and clamp all scores
        dims = data.get("dimensions", [])
        clamped = []
        for d in dims:
            clamped.append({
                "name": d.get("name", ""),
                "score": max(0, min(10, int(d.get("score", 0)))),
                "rationale": d.get("rationale", ""),
            })
        aggregate = sum(d["score"] for d in clamped)
        return {
            "dimensions": clamped,
            "aggregate_score": aggregate,
            "verdict": data.get("verdict", ""),
            "strengths": data.get("strengths", [])[:3],
            "growth_areas": data.get("growth_areas", [])[:3],
        }
    except Exception as e:
        logger.error("Scorecard generation failed: %s", e)
        return {"dimensions": [], "aggregate_score": 0, "verdict": "", "strengths": [], "growth_areas": [], "error": str(e)}


# ─── 2. Project Summary ──────────────────────────────────────────────────────

_SUMMARY_SYSTEM = """\
You are a senior technical writer and engineering hiring advisor.
You have access to a developer project's resume claims, tech stack,
and optionally its README or code docstrings.

Write a clear, engaging, and SPECIFIC project description in 3 parts:
1. WHAT it does and what problem it solves (2-3 sentences)
2. HOW it works technically — be specific about the architecture and key components (2-3 sentences)
3. WHY it matters from a hiring perspective — what it demonstrates about the developer (2 sentences)

Reference actual technologies, patterns, and details from the data.
Do NOT be generic. Do NOT say "the developer built a system that...".
Write in third person about the project itself, not the developer.

Return ONLY valid JSON:
{
  "what": "<2-3 sentences: what it does and the problem it solves>",
  "how": "<2-3 sentences: technical approach, key components, architecture>",
  "why": "<2 sentences: what this demonstrates from a hiring perspective>",
  "one_liner": "<1 compelling sentence suitable for a LinkedIn headline>"
}"""


async def generate_project_summary(
    project_name: str,
    tech_stack: list[str],
    bullet_claims: list[str],
    matched_repo_id: str,
    matched_repo_name: str,
    repo_github_url: str,
) -> dict[str, Any]:
    """
    Generate a rich 3-part project description.
    Fetches README from GitHub if available; falls back to Neo4j docstrings.
    """
    llm = get_llm_model(temperature=0.4)

    # Try README first
    readme_text, readme_found = await _fetch_readme(repo_github_url)

    # Fallback: fetch docstrings from Neo4j
    docstrings: list[str] = []
    if not readme_found and matched_repo_id:
        try:
            doc_rows = query_graph(
                "MATCH (fn:Function) WHERE fn.repo_id = $rid "
                "AND fn.docstring IS NOT NULL AND fn.docstring <> '' "
                "RETURN fn.name AS name, fn.docstring AS doc LIMIT 8",
                {"rid": matched_repo_id},
            )
            docstrings = [
                f"{r.get('name', '')}: {r.get('doc', '')[:200]}"
                for r in doc_rows
                if r.get("doc")
            ]
        except Exception as exc:
            logger.debug("Docstring fetch failed: %s", exc)

    # Build context block
    context_parts = []
    if readme_found:
        context_parts.append(f"README (truncated to 3000 chars):\n{readme_text}")
    elif docstrings:
        context_parts.append("CODE DOCSTRINGS (from repo):\n" + "\n".join(docstrings))
    else:
        context_parts.append("(No README or docstrings available — use resume claims and tech stack only)")

    bullets_str = "\n".join(f"  • {b}" for b in bullet_claims[:8])

    human = f"""Describe this project comprehensively for a technical hiring audience.

PROJECT NAME: {project_name}
MATCHED REPO: {matched_repo_name or '(none)'}
TECH STACK: {', '.join(tech_stack)}

RESUME BULLET CLAIMS:
{bullets_str or '  (none provided)'}

{chr(10).join(context_parts)}

Write a specific, detailed description. Reference actual technologies and patterns.
Return only the JSON."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_SUMMARY_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        return {
            "what": data.get("what", ""),
            "how": data.get("how", ""),
            "why": data.get("why", ""),
            "one_liner": data.get("one_liner", ""),
            "readme_used": readme_found,
        }
    except Exception as e:
        logger.error("Project summary failed: %s", e)
        return {"what": "", "how": "", "why": "", "one_liner": "", "readme_used": False, "error": str(e)}


# ─── 3. Tech Debt Radar ──────────────────────────────────────────────────────

_TECH_DEBT_SYSTEM = """\
You are a principal engineer performing a technical debt and code health assessment.
You are given structural code graph statistics — NOT the raw source code.
Identify real risks and provide actionable guidance.

Be specific: name actual functions and files from the data.
Do NOT give generic advice like "add more tests" unless the data specifically shows lack of testing.

Return ONLY valid JSON:
{
  "overall_health": "<Excellent | Good | Moderate | Poor>",
  "health_score": <0-100>,
  "risk_level": "<Low | Medium | High | Critical>",
  "summary": "<2 sentences: overall code health assessment with specific evidence>",
  "hotspots": [
    {
      "name": "<function or file name>",
      "file": "<filename>",
      "complexity": <number>,
      "risk": "<1 sentence: why this is risky>",
      "suggestion": "<1 sentence: specific fix>"
    }
  ],
  "quick_wins": [
    "<specific, actionable improvement referencing a file or function name>"
  ],
  "refactor_priority": "<which area of the codebase needs the most attention and why>",
  "positive_signals": ["<something the code does well>", "<...>"]
}"""


async def generate_tech_debt_radar(
    matched_repo_id: str,
    matched_repo_name: str,
    tech_stack: list[str],
) -> dict[str, Any]:
    """Analyse technical debt and code health using Neo4j graph statistics."""
    llm = get_llm_model(temperature=0.3)
    stats = _fetch_repo_complexity_stats(matched_repo_id)

    # Get file-level complexity rollup for richer context
    file_complexity: list[dict] = []
    try:
        file_rows = query_graph(
            "MATCH (fn:Function) WHERE fn.repo_id = $rid AND fn.complexity_score IS NOT NULL "
            "WITH fn.file_path AS fp, avg(fn.complexity_score) AS avg_c, max(fn.complexity_score) AS max_c, count(fn) AS fn_cnt "
            "ORDER BY avg_c DESC LIMIT 5 "
            "RETURN fp, avg_c, max_c, fn_cnt",
            {"rid": matched_repo_id},
        )
        file_complexity = [
            {
                "file": (r.get("fp") or "").split("/")[-1],
                "avg_complexity": round(float(r.get("avg_c", 0) or 0), 1),
                "max_complexity": int(r.get("max_c", 0) or 0),
                "function_count": r.get("fn_cnt", 0),
            }
            for r in file_rows
        ]
    except Exception:
        pass

    hotspot_str = "\n".join(
        f"  - {h['name']} in {h['file']} (complexity: {h['complexity']})"
        for h in stats.get("hotspots", [])
    ) or "  (none available)"

    file_complexity_str = "\n".join(
        f"  - {fc['file']}: avg complexity {fc['avg_complexity']}, max {fc['max_complexity']}, {fc['function_count']} functions"
        for fc in file_complexity
    ) or "  (none available)"

    buckets = stats.get("complexity_buckets", {})
    total_fns = sum(buckets.values()) or 1
    high_complexity_pct = round((buckets.get("11-20", 0) + buckets.get("21+", 0)) / total_fns * 100)

    human = f"""Perform a technical debt and code health assessment for this repository.

REPO: {matched_repo_name or matched_repo_id}
TECH STACK: {', '.join(tech_stack)}

STRUCTURAL STATS:
  Files: {stats.get('file_count', '?')}  |  Functions: {stats.get('function_count', '?')}  |  Classes: {stats.get('class_count', '?')}
  Avg cyclomatic complexity: {stats.get('avg_complexity', 0):.1f}  |  Max: {stats.get('max_complexity', '?')}
  Orphan/disconnected nodes: {stats.get('orphan_count', '?')}
  Docstring coverage: {int(stats.get('docstring_ratio', 0) * 100)}%
  High-complexity functions (11+): {high_complexity_pct}% of all functions

COMPLEXITY DISTRIBUTION:
  Simple (1-5):     {buckets.get('1-5', 0)} functions
  Moderate (6-10):  {buckets.get('6-10', 0)} functions
  Complex (11-20):  {buckets.get('11-20', 0)} functions
  Very complex (21+): {buckets.get('21+', 0)} functions

TOP COMPLEXITY HOTSPOTS (by function):
{hotspot_str}

MOST COMPLEX FILES (by average function complexity):
{file_complexity_str}

ARCHITECTURAL HUBS (most connected nodes — high coupling risk):
{', '.join(f"{h['name']} ({h['degree']} connections)" for h in stats.get('top_hubs', [])) or '(none)'}

Produce a technical debt radar assessment. Be specific and reference real names from the data."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_TECH_DEBT_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        return {
            "overall_health": data.get("overall_health", "Unknown"),
            "health_score": max(0, min(100, int(data.get("health_score", 50)))),
            "risk_level": data.get("risk_level", "Unknown"),
            "summary": data.get("summary", ""),
            "hotspots": data.get("hotspots", [])[:5],
            "quick_wins": data.get("quick_wins", [])[:4],
            "refactor_priority": data.get("refactor_priority", ""),
            "positive_signals": data.get("positive_signals", [])[:3],
            "stats": {
                "avg_complexity": stats.get("avg_complexity", 0),
                "high_complexity_pct": high_complexity_pct,
                "docstring_ratio": int(stats.get("docstring_ratio", 0) * 100),
                "orphan_count": stats.get("orphan_count", 0),
                "complexity_buckets": buckets,
            },
        }
    except Exception as e:
        logger.error("Tech debt radar failed: %s", e)
        return {"overall_health": "Unknown", "health_score": 0, "risk_level": "Unknown", "summary": "", "hotspots": [], "quick_wins": [], "refactor_priority": "", "positive_signals": [], "error": str(e)}


# ─── 4. Skill Signals ────────────────────────────────────────────────────────

_SKILL_SIGNALS_SYSTEM = """\
You are a senior technical recruiter and engineering hiring manager.
You are reviewing the verified evidence from a developer's project to identify
the specific, demonstrable skills this project proves — not what's claimed on the resume,
but what is actually evidenced in the codebase.

For each skill signal, assess its evidence strength:
  Strong  = multiple specific code nodes found, direct implementation visible
  Medium  = some evidence found, partially supported
  Weak    = claimed but not strongly evidenced in the code

Return ONLY valid JSON:
{
  "signals": [
    {
      "skill": "<specific skill name>",
      "evidence_strength": "<Strong | Medium | Weak>",
      "proof_point": "<1 sentence: specific code evidence — name functions/files if available>",
      "interview_angle": "<1 sentence: what to probe in an interview about this skill>"
    }
  ],
  "top_skill": "<the single most strongly evidenced skill>",
  "weakest_signal": "<the skill with the weakest evidence>",
  "overall_signal": "<1 sentence: what story does this project tell about the developer's skill profile>"
}"""


async def extract_skill_signals(
    project_name: str,
    tech_stack: list[str],
    bullet_verdicts: list[dict],
    reasoning: str,
    all_evidence_node_ids: list[str],
    matched_repo_name: str,
) -> dict[str, Any]:
    """Extract demonstrable skill signals with evidence strength ratings."""
    llm = get_llm_model(temperature=0.3)

    supported = [(v["claim"], v.get("evidence_nodes", [])) for v in bullet_verdicts if v.get("supported")]
    unsupported = [v["claim"] for v in bullet_verdicts if not v.get("supported")]

    supported_str = "\n".join(
        f"  ✅ {claim}\n     Evidence: {', '.join(nodes[:3]) or 'implicit'}"
        for claim, nodes in supported[:6]
    ) or "  (none)"

    unsupported_str = "\n".join(f"  ❌ {c}" for c in unsupported[:4]) or "  (none)"

    node_sample = ", ".join(all_evidence_node_ids[:15]) or "(none)"

    human = f"""Identify the skill signals demonstrated by this project's verified evidence.

PROJECT: {project_name}
REPO: {matched_repo_name or '(unknown)'}
CLAIMED TECH STACK: {', '.join(tech_stack)}

VERIFIED RESUME BULLETS (with code evidence):
{supported_str}

UNVERIFIED CLAIMS:
{unsupported_str}

VERIFICATION REASONING:
{reasoning or '(not available)'}

SAMPLE EVIDENCE NODES FOUND IN CODEBASE:
{node_sample}

Extract 4-7 specific skill signals from this evidence. Be concrete — name the actual proof points.
Return only the JSON."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_SKILL_SIGNALS_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        signals = data.get("signals", [])
        # Validate strength values
        valid_strengths = {"Strong", "Medium", "Weak"}
        for s in signals:
            if s.get("evidence_strength") not in valid_strengths:
                s["evidence_strength"] = "Medium"
        return {
            "signals": signals[:7],
            "top_skill": data.get("top_skill", ""),
            "weakest_signal": data.get("weakest_signal", ""),
            "overall_signal": data.get("overall_signal", ""),
        }
    except Exception as e:
        logger.error("Skill signals extraction failed: %s", e)
        return {"signals": [], "top_skill": "", "weakest_signal": "", "overall_signal": "", "error": str(e)}


# ─── 5. Recruiter Pitch ──────────────────────────────────────────────────────

_PITCH_SYSTEM = """\
You are a senior career coach and technical recruiter helping a developer
craft the perfect one-paragraph pitch for their project.

Write a punchy, specific, and compelling project pitch that:
1. Opens with WHAT the project is (hook — no fluff)
2. States the technical approach and key architectural decision (1 sentence)
3. Closes with the measurable outcome or verified proof (1 sentence)

Also provide a shorter LinkedIn-style version and a one-line tagline.

Calibrate for the verification score — if low, be honest but still highlight genuine strengths.

Return ONLY valid JSON:
{
  "pitch": "<3-sentence paragraph pitch — professional, direct, no buzzwords>",
  "linkedin_version": "<2 sentences, slightly more casual, LinkedIn-optimised>",
  "tagline": "<1 punchy line, max 15 words — could be a LinkedIn headline>",
  "tone_note": "<1 sentence: how to deliver this pitch verbally in an interview>"
}"""


async def generate_recruiter_pitch(
    project_name: str,
    tech_stack: list[str],
    overall_score: int,
    status: str,
    bullet_verdicts: list[dict],
    reasoning: str,
    matched_repo_name: str,
) -> dict[str, Any]:
    """Generate a one-click recruiter-ready 3-sentence project pitch."""
    llm = get_llm_model(temperature=0.6)

    supported = [v["claim"] for v in bullet_verdicts if v.get("supported")]
    key_bullets = "\n".join(f"  • {b}" for b in supported[:4]) or "  (no verified claims)"

    human = f"""Write a compelling recruiter pitch for this verified project.

PROJECT: {project_name}
MATCHED REPO: {matched_repo_name or '(none)'}
TECH STACK: {', '.join(tech_stack)}
VERIFICATION STATUS: {status} ({overall_score}/100)

VERIFIED ACHIEVEMENTS:
{key_bullets}

VERIFICATION REASONING (use this for specific details):
{reasoning or '(not available)'}

Write the pitch. Make it specific — reference actual technologies. Keep it authentic.
Score: {overall_score}/100 — calibrate confidence accordingly.
Return only the JSON."""

    try:
        resp = await llm.ainvoke([SystemMessage(content=_PITCH_SYSTEM), HumanMessage(content=human)])
        data = parse_json_response(resp.content)
        return {
            "pitch": data.get("pitch", ""),
            "linkedin_version": data.get("linkedin_version", ""),
            "tagline": data.get("tagline", ""),
            "tone_note": data.get("tone_note", ""),
        }
    except Exception as e:
        logger.error("Recruiter pitch generation failed: %s", e)
        return {"pitch": "", "linkedin_version": "", "tagline": "", "tone_note": "", "error": str(e)}

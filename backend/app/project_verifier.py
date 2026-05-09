"""
Project Verification Module
============================
Verifies project-level claims from a resume against ingested GitHub repositories.

Unlike skill verification (which asks "can you code in Python?"), project verification
asks "did you actually build what you claim to have built?" by:

1. Parsing project blocks from the resume (name, tech stack, GitHub URL, bullet claims)
2. Matching each project to the best-fit ingested repo
3. Checking tech stack coverage via Neo4j Cypher
4. Assessing architectural bullet claims via LLM

Scoring model (max 100):
    tech_coverage_score  : 0-40  (found techs / claimed techs) × 40
    architecture_score   : 0-35  LLM rubric assessment
    claim_support_score  : 0-25  avg graph evidence per bullet claim

Thresholds:
    Verified          >= 65
    Partially Verified >= 35
    Unverified         < 35
    Repo Not Ingested  — matched_repo_id is empty
"""

import re
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage

from .db import query_graph
from .llm import get_llm_model, parse_json_response
from .agents import _expand_topic_keywords, build_repo_profile_map


# =============================================================================
# Pydantic Models
# =============================================================================

class ProjectClaim(BaseModel):
    """A single project block extracted from the resume."""
    project_id: str = ""
    name: str                          # e.g. "GenAI-Powered Educational Platform"
    tech_stack: list[str]              # ["RAG", "Python", "Flask", "OpenAI"]
    github_url: str = ""               # raw URL if present in resume
    date: str = ""                     # e.g. "Mar 2025"
    bullet_claims: list[str]           # bullet-point sentences from the resume


class TechCoverageItem(BaseModel):
    """Per-technology evidence result."""
    tech: str
    found: bool
    evidence_node_ids: list[str] = Field(default_factory=list)


class BulletVerdict(BaseModel):
    """Verification verdict for one bullet-point claim."""
    claim: str
    supported: bool
    evidence_nodes: list[str] = Field(default_factory=list)


class ProjectVerificationResult(BaseModel):
    """Full verification result for one resume project."""
    project_id: str
    name: str
    tech_stack: list[str]
    status: str              # "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested"
    overall_score: int       # 0-100
    matched_repo_id: str = ""
    matched_repo_name: str = ""
    tech_coverage: list[TechCoverageItem] = Field(default_factory=list)
    tech_coverage_score: int = 0
    architecture_score: int = 0
    claim_support_score: int = 0
    reasoning: str = ""
    bullet_verdicts: list[BulletVerdict] = Field(default_factory=list)


class ProjectSummary(BaseModel):
    """Aggregate summary for all project verifications in a session."""
    total: int = 0
    verified: int = 0
    partially_verified: int = 0
    unverified: int = 0
    repo_not_ingested: int = 0
    average_score: float = 0.0


# =============================================================================
# Step 1: Parse Project Claims from Resume Text
# =============================================================================

async def parse_project_claims(resume_text: str) -> list[ProjectClaim]:
    """
    Use an LLM to extract project blocks from resume text.
    Returns up to 10 ProjectClaim objects.
    """
    llm = get_llm_model(temperature=0.1)

    system_prompt = """You are an expert resume analyzer. Extract all project blocks from this resume.

A "project block" is a section describing something the candidate built — typically has:
- A project name (often bold or on its own line)
- A tech stack list (comma-separated technologies)
- An optional GitHub URL
- An optional date
- 2-5 bullet points describing what was built

For each project, return EXACTLY these fields:
1. **name**: The project name (e.g. "GenAI-Powered Educational Platform")
2. **tech_stack**: List of technologies/tools mentioned (e.g. ["Python", "Flask", "RAG", "OpenAI"])
3. **github_url**: GitHub URL if present in the resume text, otherwise ""
4. **date**: Date string if present (e.g. "Mar 2025"), otherwise ""
5. **bullet_claims**: List of the bullet-point sentences describing what was built

RULES:
- Extract ONLY projects the candidate claims to have built (not courses, certifications, or job experiences unless they describe a specific deliverable)
- Maximum 10 projects
- Each bullet_claim should be a complete sentence (the full bullet text)
- Keep tech_stack items as specific as possible (e.g. "Google Pub/Sub" not just "Google")

Return ONLY valid JSON:
{
  "projects": [
    {
      "name": "...",
      "tech_stack": ["...", "..."],
      "github_url": "",
      "date": "",
      "bullet_claims": ["...", "..."]
    }
  ]
}"""

    human_prompt = f"""Extract all project blocks from this resume:

---
{resume_text}
---

Return the projects as JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
        parsed = parse_json_response(response.content)
        raw_projects = parsed.get("projects", [])

        claims: list[ProjectClaim] = []
        for i, p in enumerate(raw_projects[:10]):
            if not p.get("name") or not p.get("tech_stack"):
                continue
            claims.append(ProjectClaim(
                project_id=f"proj_{i}",
                name=p.get("name", "").strip(),
                tech_stack=[t.strip() for t in p.get("tech_stack", []) if t.strip()],
                github_url=p.get("github_url", "").strip(),
                date=p.get("date", "").strip(),
                bullet_claims=[b.strip() for b in p.get("bullet_claims", []) if b.strip()],
            ))
        return claims

    except Exception as e:
        return []


# =============================================================================
# Step 2: Match Project to the Best Ingested Repo
# =============================================================================

def _normalise_github_url(url: str) -> str:
    """Strip trailing slashes, .git suffix, and lower-case for comparison."""
    url = url.strip().rstrip("/").lower()
    if url.endswith(".git"):
        url = url[:-4]
    return url


def match_project_to_repo(
    project: ProjectClaim,
    repo_profile_map: dict[str, dict],
    repo_url_map: dict[str, str],  # repo_id -> github_url (lower-cased)
) -> str | None:
    """
    Find the best-matching ingested repo for a project.

    Strategy:
    1. If the project has a GitHub URL, try exact URL match first.
    2. Otherwise score repos by tech stack overlap and return the best match.
    3. Return None if no match is found (shows as "Repo Not Ingested").
    """
    if not repo_profile_map:
        return None

    # --- Layer 1: Direct URL match ---
    if project.github_url:
        norm = _normalise_github_url(project.github_url)
        for repo_id, repo_url in repo_url_map.items():
            if _normalise_github_url(repo_url) == norm:
                return repo_id
        # URL present but no ingested repo matches → Repo Not Ingested
        return None

    # --- Layer 2: Tech stack overlap scoring ---
    scored: list[tuple[str, int]] = []
    for repo_id, profile in repo_profile_map.items():
        imports = profile.get("imports", set())
        names   = profile.get("names", set())
        langs   = profile.get("languages", set())
        score   = 0

        for tech in project.tech_stack:
            kws = _expand_topic_keywords(tech)
            for kw in kws:
                if len(kw) >= 3 and any(kw in imp or imp.startswith(kw) for imp in imports):
                    score += 2
                    break
            for kw in kws:
                if len(kw) >= 4 and any(kw in nm for nm in names):
                    score += 1
                    break
            for kw in kws:
                if any(kw in lang for lang in langs):
                    score += 1
                    break

        scored.append((repo_id, score))

    # Need at least 1 matching signal
    best = max(scored, key=lambda x: x[1]) if scored else None
    if best and best[1] >= 1:
        return best[0]

    return None


# =============================================================================
# Step 3: Check Tech Stack Coverage
# =============================================================================

def check_tech_coverage(
    project: ProjectClaim,
    repo_id: str,
) -> list[TechCoverageItem]:
    """
    For each technology in the claimed stack, query Neo4j to find evidence.
    Returns a TechCoverageItem per technology.
    """
    CYPHER = """
    MATCH (n)
    WHERE n.repo_id = $repo_id
      AND ANY(kw IN $keywords WHERE
        toLower(n.name) CONTAINS kw
        OR (n:Import AND toLower(n.module_name) CONTAINS kw)
        OR (n:Function AND n.source_code IS NOT NULL
            AND toLower(substring(n.source_code, 0, 1000)) CONTAINS kw)
        OR (n.file_path IS NOT NULL AND toLower(n.file_path) CONTAINS kw)
      )
    WITH n
    RETURN
        n.name AS node_name,
        n.file_path AS file_path,
        COALESCE(n.module_name, n.name) AS display_name
    LIMIT 20
    """

    results: list[TechCoverageItem] = []
    for tech in project.tech_stack:
        keywords = _expand_topic_keywords(tech)
        # Always include the raw tech name and lowercased tokens
        keywords = list(set(keywords + [tech.lower()] + tech.lower().split()))
        keywords = [k for k in keywords if len(k) >= 2]

        try:
            rows = query_graph(CYPHER, {"repo_id": repo_id, "keywords": keywords})
            found = len(rows) > 0
            node_ids = []
            for row in rows[:6]:
                name = row.get("node_name") or row.get("display_name", "")
                fp   = row.get("file_path", "")
                node_ids.append(f"{fp}:{name}" if fp else name)

            results.append(TechCoverageItem(
                tech=tech,
                found=found,
                evidence_node_ids=node_ids,
            ))
        except Exception:
            results.append(TechCoverageItem(tech=tech, found=False, evidence_node_ids=[]))

    return results


# =============================================================================
# Step 4: Assess Architectural / Bullet Claims via LLM
# =============================================================================

async def assess_architecture(
    project: ProjectClaim,
    tech_coverage: list[TechCoverageItem],
    repo_id: str,
) -> dict:
    """
    LLM assesses bullet-point claims against graph evidence.
    Returns {architecture_score: 0-35, reasoning: str, bullet_verdicts: list[dict]}.
    """
    llm = get_llm_model(temperature=0.1)

    # Build a concise evidence summary for the LLM
    found_techs  = [t.tech for t in tech_coverage if t.found]
    missing_techs = [t.tech for t in tech_coverage if not t.found]
    coverage_pct  = int(len(found_techs) / max(len(tech_coverage), 1) * 100)

    # Fetch a sample of function names from the matched repo for architectural context
    try:
        fn_rows = query_graph(
            "MATCH (f:Function) WHERE f.repo_id = $rid RETURN f.name AS name, f.file_path AS fp "
            "ORDER BY f.complexity_score DESC LIMIT 30",
            {"rid": repo_id}
        )
        fn_sample = [f"{r.get('fp','').split('/')[-1]}:{r.get('name','')}" for r in fn_rows]
    except Exception:
        fn_sample = []

    evidence_text = (
        f"Tech found in repo: {', '.join(found_techs) or 'none'}\n"
        f"Tech NOT found: {', '.join(missing_techs) or 'none'}\n"
        f"Tech coverage: {coverage_pct}%\n"
        f"Top functions in repo: {', '.join(fn_sample[:15]) or 'none available'}"
    )

    bullets_text = "\n".join(f"• {b}" for b in project.bullet_claims)

    prompt = f"""You are a senior engineering interviewer verifying a project claim in a resume.

PROJECT: "{project.name}"
CLAIMED TECH STACK: {', '.join(project.tech_stack)}

CANDIDATE'S CLAIMS (bullet points from resume):
{bullets_text}

EVIDENCE FROM THE MATCHED REPOSITORY:
{evidence_text}

CALIBRATION (architecture_score 0-35):
- 28-35: Bullet claims are strongly supported. Tech stack matches repo. Architecture described is clearly visible in function names / structure.
- 15-27: Partial support. Some claims are consistent with the repo, but key architectural features are not clearly evidenced.
- 5-14: Weak support. Tech is partially found but bullet claims seem overstated vs. what the repo shows.
- 0-4:  No meaningful support. Claims are inconsistent with repo evidence.

For bullet_verdicts, assess each bullet point INDEPENDENTLY. A bullet is "supported" if the repo evidence is consistent with the described functionality.

Return ONLY valid JSON:
{{
  "architecture_score": <0-35>,
  "reasoning": "<2-3 sentences synthesising the overall verdict>",
  "bullet_verdicts": [
    {{"claim": "<exact bullet text>", "supported": true/false, "evidence_nodes": ["...", ...]}}
  ]
}}"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        data = parse_json_response(response.content)
        score = min(max(int(data.get("architecture_score", 0)), 0), 35)
        reasoning = data.get("reasoning", "")
        raw_verdicts = data.get("bullet_verdicts", [])
        verdicts = [
            BulletVerdict(
                claim=v.get("claim", ""),
                supported=bool(v.get("supported", False)),
                evidence_nodes=v.get("evidence_nodes", []),
            )
            for v in raw_verdicts
        ]
        return {
            "architecture_score": score,
            "reasoning": reasoning,
            "bullet_verdicts": verdicts,
        }
    except Exception as e:
        return {
            "architecture_score": 0,
            "reasoning": f"Architecture assessment failed: {str(e)}",
            "bullet_verdicts": [],
        }


# =============================================================================
# Step 5: Compute claim_support_score from bullet verdicts
# =============================================================================

def _compute_claim_support_score(
    bullet_verdicts: list[BulletVerdict],
) -> int:
    """
    Score 0-25 based on what fraction of bullet claims have evidence.
    """
    if not bullet_verdicts:
        return 0
    supported_count = sum(1 for v in bullet_verdicts if v.supported)
    fraction = supported_count / len(bullet_verdicts)
    return min(round(fraction * 25), 25)


# =============================================================================
# Step 6: Orchestrate — verify one project
# =============================================================================

async def verify_project(
    project: ProjectClaim,
    repo_id: str,
    repo_name: str,
) -> ProjectVerificationResult:
    """
    Full pipeline for one project:
    1. Tech coverage (Cypher)
    2. Architecture assessment (LLM)
    3. Score computation
    """
    # Tech coverage (pure Cypher — fast)
    tech_coverage = check_tech_coverage(project, repo_id)
    found_count = sum(1 for t in tech_coverage if t.found)
    total_count = max(len(tech_coverage), 1)
    tech_coverage_score = min(round((found_count / total_count) * 40), 40)

    # Architecture + bullet assessment (LLM)
    arch_result = await assess_architecture(project, tech_coverage, repo_id)
    architecture_score = arch_result["architecture_score"]
    reasoning         = arch_result["reasoning"]
    bullet_verdicts   = arch_result["bullet_verdicts"]

    # Claim support score
    claim_support_score = _compute_claim_support_score(bullet_verdicts)

    # Final score + status
    overall_score = tech_coverage_score + architecture_score + claim_support_score
    if overall_score >= 65:
        status = "Verified"
    elif overall_score >= 35:
        status = "Partially Verified"
    else:
        status = "Unverified"

    return ProjectVerificationResult(
        project_id=project.project_id,
        name=project.name,
        tech_stack=project.tech_stack,
        status=status,
        overall_score=overall_score,
        matched_repo_id=repo_id,
        matched_repo_name=repo_name,
        tech_coverage=tech_coverage,
        tech_coverage_score=tech_coverage_score,
        architecture_score=architecture_score,
        claim_support_score=claim_support_score,
        reasoning=reasoning,
        bullet_verdicts=bullet_verdicts,
    )


# =============================================================================
# Top-level entry point for the API endpoint
# =============================================================================

async def analyze_projects(
    resume_text: str,
    repo_ids: list[str],
) -> dict:
    """
    Full project verification pipeline.

    Args:
        resume_text: Extracted PDF text.
        repo_ids:    List of already-ingested repo IDs to match against.

    Returns:
        dict with keys: projects (list), summary (dict)
    """
    # Build repo profile map for tech-overlap matching
    repo_profile_map = build_repo_profile_map(repo_ids)

    # Fetch repo names + URLs from Neo4j for display and URL matching
    repo_meta: dict[str, dict] = {}  # repo_id -> {name, url}
    for rid in repo_ids:
        try:
            rows = query_graph(
                "MATCH (f:File) WHERE f.repo_id = $rid "
                "RETURN f.path AS path LIMIT 1",
                {"rid": rid}
            )
            # Try to infer repo name from file paths
            sample_path = rows[0].get("path", "") if rows else ""
            repo_name = sample_path.split("/")[0] if "/" in sample_path else rid[:8]
            repo_meta[rid] = {"name": repo_name, "url": ""}
        except Exception:
            repo_meta[rid] = {"name": rid[:8], "url": ""}

    # Fetch GitHub URLs stored in Neo4j (stored as repo metadata if ingested via ingest.py)
    repo_url_map: dict[str, str] = {}
    for rid in repo_ids:
        try:
            rows = query_graph(
                "MATCH (f:File) WHERE f.repo_id = $rid AND f.github_url IS NOT NULL "
                "RETURN f.github_url AS url LIMIT 1",
                {"rid": rid}
            )
            if rows and rows[0].get("url"):
                repo_url_map[rid] = rows[0]["url"]
                repo_meta[rid]["url"] = rows[0]["url"]
        except Exception:
            pass

    # Parse project claims from resume
    projects = await parse_project_claims(resume_text)

    results: list[ProjectVerificationResult] = []
    for project in projects:
        matched_id = match_project_to_repo(project, repo_profile_map, repo_url_map)

        if matched_id is None:
            # No repo matches — "Repo Not Ingested"
            results.append(ProjectVerificationResult(
                project_id=project.project_id,
                name=project.name,
                tech_stack=project.tech_stack,
                status="Repo Not Ingested",
                overall_score=0,
                matched_repo_id="",
                matched_repo_name="",
                tech_coverage=[TechCoverageItem(tech=t, found=False) for t in project.tech_stack],
                tech_coverage_score=0,
                architecture_score=0,
                claim_support_score=0,
                reasoning="No ingested repository matched this project. Ingest the relevant GitHub repo to enable verification.",
                bullet_verdicts=[BulletVerdict(claim=b, supported=False) for b in project.bullet_claims],
            ))
        else:
            repo_name = repo_meta.get(matched_id, {}).get("name", matched_id[:8])
            result = await verify_project(project, matched_id, repo_name)
            results.append(result)

    # Build summary
    verified  = sum(1 for r in results if r.status == "Verified")
    partial   = sum(1 for r in results if r.status == "Partially Verified")
    unverif   = sum(1 for r in results if r.status == "Unverified")
    not_ingest = sum(1 for r in results if r.status == "Repo Not Ingested")
    assessed  = [r for r in results if r.status != "Repo Not Ingested"]
    avg_score = round(sum(r.overall_score for r in assessed) / max(len(assessed), 1), 1)

    summary = ProjectSummary(
        total=len(results),
        verified=verified,
        partially_verified=partial,
        unverified=unverif,
        repo_not_ingested=not_ingest,
        average_score=avg_score,
    )

    return {
        "projects": [r.model_dump() for r in results],
        "summary": summary.model_dump(),
    }

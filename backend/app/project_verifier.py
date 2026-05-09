"""
Project Verification Module — Phase 2
======================================
5-layer matching algorithm (URL → Name → Import → Language → None).
Short-circuits architecture LLM when tech coverage < 25%.
Weighted claim_support_score. Richer LLM context.

Scoring model (max 100):
    tech_coverage_score  : 0-40
    architecture_score   : 0-35  (0 if coverage < 25%)
    claim_support_score  : 0-25  (weighted by evidence depth)

Thresholds: Verified ≥ 65 · Partially Verified ≥ 35 · Unverified < 35
"""

import re
from typing import Optional, Tuple
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage

from .db import query_graph
from .llm import get_llm_model, parse_json_response
from .agents import _expand_topic_keywords, build_repo_profile_map
from .storage import get_repo_info, get_all_repos


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class ProjectClaim(BaseModel):
    project_id: str = ""
    name: str
    tech_stack: list
    github_url: str = ""
    date: str = ""
    bullet_claims: list


class TechCoverageItem(BaseModel):
    tech: str
    found: bool
    evidence_node_ids: list = Field(default_factory=list)


class BulletVerdict(BaseModel):
    claim: str
    supported: bool
    evidence_nodes: list = Field(default_factory=list)
    missing_evidence_hint: str = ""


class ProjectVerificationResult(BaseModel):
    project_id: str
    name: str
    tech_stack: list
    status: str
    overall_score: int = 0
    matched_repo_id: str = ""
    matched_repo_name: str = ""
    repo_github_url: str = ""
    match_confidence: float = 0.0
    match_reason: str = ""
    tech_coverage: list = Field(default_factory=list)
    tech_coverage_score: int = 0
    architecture_score: int = 0
    claim_support_score: int = 0
    tech_found_count: int = 0
    tech_total_count: int = 0
    reasoning: str = ""
    bullet_verdicts: list = Field(default_factory=list)
    all_evidence_node_ids: list = Field(default_factory=list)  # flat union across all found techs


class ProjectSummary(BaseModel):
    total: int = 0
    verified: int = 0
    partially_verified: int = 0
    unverified: int = 0
    repo_not_ingested: int = 0
    average_score: float = 0.0
    avg_match_confidence: float = 0.0


# ─── Specific import aliases for matching (tight, not synonym-expanded) ───────

SPECIFIC_TECH_IMPORTS: dict = {
    "react":           ["react"],
    "next.js":         ["next"],
    "nextjs":          ["next"],
    "vue":             ["vue"],
    "angular":         ["@angular"],
    "svelte":          ["svelte"],
    "langchain":       ["langchain"],
    "langgraph":       ["langgraph"],
    "openai":          ["openai"],
    "anthropic":       ["anthropic"],
    "gemini":          ["google.generativeai", "vertexai"],
    "google cloud":    ["google.cloud"],
    "pub/sub":         ["google.cloud.pubsub", "@google-cloud/pubsub", "pubsub"],
    "vertex ai":       ["google.cloud.aiplatform", "vertexai"],
    "cloud storage":   ["google.cloud.storage", "@google-cloud/storage"],
    "prisma":          ["@prisma", "prisma"],
    "flask":           ["flask"],
    "fastapi":         ["fastapi"],
    "django":          ["django"],
    "express":         ["express"],
    "pytorch":         ["torch"],
    "tensorflow":      ["tensorflow"],
    "sklearn":         ["sklearn", "scikit"],
    "neo4j":           ["neo4j"],
    "mongodb":         ["pymongo", "mongoose"],
    "postgres":        ["psycopg", "psycopg2", "pg"],
    "redis":           ["redis", "aioredis"],
    "kafka":           ["kafka", "aiokafka"],
    "graphql":         ["graphql"],
    "mcp":             ["mcp"],
    "hugging face":    ["transformers"],
    "transformers":    ["transformers"],
    "rag":             ["chromadb", "pinecone", "faiss", "weaviate", "qdrant"],
    "streamlit":       ["streamlit"],
    "supabase":        ["supabase"],
    "ast parsing":     ["ast", "tree_sitter", "tree-sitter"],
    "tree-sitter":     ["tree_sitter"],
    "drizzle":         ["drizzle-orm"],
    "trpc":            ["@trpc"],
    # Infrastructure techs that have no importable package — skip gracefully
    "cloud run":       [],
    "kubernetes":      [],
    "docker":          [],
    "typescript":      [],
    "python":          [],
    "java":            [],
}


# ─── Step 1: Parse project claims ─────────────────────────────────────────────

async def parse_project_claims(resume_text: str) -> list:
    llm = get_llm_model(temperature=0.1)

    system = """You are an expert resume parser. Extract every project block.
A project block has: name, tech stack, optional GitHub URL, optional date, bullet points.

Return ONLY valid JSON:
{
  "projects": [
    {
      "name": "...",
      "tech_stack": ["Tech1", "Tech2"],
      "github_url": "",
      "date": "",
      "bullet_claims": ["Full bullet sentence...", "..."]
    }
  ]
}

Rules:
- Extract projects the candidate BUILT (not courses or certifications)
- Max 10 projects. Keep tech_stack items specific ("Google Pub/Sub" not "Google").
- Include the complete GitHub URL if present."""

    human = f"Extract all project blocks:\n---\n{resume_text}\n---\nReturn JSON."

    try:
        resp = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=human)])
        raw = parse_json_response(resp.content).get("projects", [])
        claims = []
        for i, p in enumerate(raw[:10]):
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
    except Exception:
        return []


# ─── Step 2: 5-Layer matching ─────────────────────────────────────────────────

def _normalise_github_url(url: str) -> str:
    """Strip protocol, .git suffix, path segments beyond owner/repo, lowercase."""
    url = url.strip().lower()
    url = re.sub(r'^https?://', '', url)
    url = re.sub(r'\.git$', '', url)
    url = url.rstrip('/')
    parts = url.split('/')
    if len(parts) >= 3:
        url = '/'.join(parts[:3])   # domain/owner/repo only
    return url


def _token_overlap(s1: str, s2: str) -> float:
    """Jaccard token similarity between two name strings."""
    def tok(s: str) -> set:
        return set(w for w in re.sub(r'[-_\s]+', ' ', s.lower()).split() if len(w) > 1)
    t1, t2 = tok(s1), tok(s2)
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


def _name_match_score(project_name: str, repo_name: str) -> float:
    """
    Combined name similarity: Jaccard token overlap PLUS substring containment.
    Handles cases like repo='Legal' matching project='Legal Contract Analysis System'.
    Returns 0.0-1.0.
    """
    def tok(s: str) -> set:
        return set(w for w in re.sub(r'[-_\s]+', ' ', s.lower()).split() if len(w) > 1)

    t1, t2 = tok(project_name), tok(repo_name)
    jaccard = len(t1 & t2) / len(t1 | t2) if (t1 and t2) else 0.0

    # Substring containment: all meaningful tokens of repo name in project name text.
    # e.g. "Legal" → ["legal"] → all found in "legal contract analysis system" → 1.0 * 0.9
    pn_lower = project_name.lower()
    repo_tokens = [w for w in re.sub(r'[-_\s]+', ' ', repo_name.lower()).split() if len(w) > 2]
    if repo_tokens:
        found_frac = sum(1 for w in repo_tokens if w in pn_lower) / len(repo_tokens)
        if found_frac >= 0.8:
            jaccard = max(jaccard, found_frac * 0.9)

    return jaccard


def match_project_to_repo(
    project: ProjectClaim,
    repo_profile_map: dict,
    repo_url_map: dict,
    repo_meta: dict,
) -> Tuple[Optional[str], float, str]:
    """
    5-layer matching. Returns (repo_id | None, confidence 0-1, reason string).

    Layer 1 — Exact URL match (highest confidence, hard boundary if URL present)
    Layer 2 — Project name ↔ repo name token overlap (≥ 0.55 Jaccard)
    Layer 3 — Specific import presence (≥ 2 distinct import-level matches)
    Layer 4 — Language alignment as tiebreaker between tied repos
    Layer 5 — None (Repo Not Ingested)
    """
    if not repo_profile_map:
        return None, 0.0, ""

    # --- Layer 1: Exact GitHub URL match ---
    if project.github_url:
        norm = _normalise_github_url(project.github_url)
        for rid, repo_url in repo_url_map.items():
            if _normalise_github_url(repo_url) == norm:
                return rid, 1.0, "URL match"
        # URL present but repo not ingested → hard None (no fallback)
        return None, 0.0, f"GitHub URL not ingested: {project.github_url}"

    # --- Layer 2: Project name ↔ repo name matching ---
    name_scores: list = []
    for rid, meta in repo_meta.items():
        repo_name = meta.get("name", "")
        score = _name_match_score(project.name, repo_name)
        if score >= 0.45:   # lowered from 0.55; substring check handles short names
            name_scores.append((rid, score, repo_name))
    if name_scores:
        best = max(name_scores, key=lambda x: x[1])
        confidence = min(best[1] * 0.95, 0.95)
        return best[0], confidence, f"Name match: '{best[2]}' ({int(best[1]*100)}% similarity)"

    # --- Layer 3: Specific import presence ---
    import_results: list = []
    for rid, profile in repo_profile_map.items():
        imports = profile.get("imports", set())
        hit_count = 0
        matched_techs: list = []
        for tech in project.tech_stack:
            aliases = SPECIFIC_TECH_IMPORTS.get(tech.lower(), [])
            if not aliases:
                continue   # infrastructure tech — skip
            if any(alias in imp for alias in aliases for imp in imports):
                hit_count += 1
                matched_techs.append(tech)
        if hit_count >= 2:
            import_results.append((rid, hit_count, matched_techs))

    if import_results:
        # Layer 4: break ties by language overlap
        lang_hints: dict = {}
        for rid, profile in repo_profile_map.items():
            langs = profile.get("languages", set())
            lang_score = 0
            for tech in project.tech_stack:
                kws = _expand_topic_keywords(tech)
                if any(kw in langs for kw in kws):
                    lang_score += 1
            lang_hints[rid] = lang_score

        best = max(import_results, key=lambda x: (x[1], lang_hints.get(x[0], 0)))
        rid, hit_count, matched_techs = best
        total = max(len([t for t in project.tech_stack if SPECIFIC_TECH_IMPORTS.get(t.lower()) is not None and SPECIFIC_TECH_IMPORTS.get(t.lower()) != []]), 1)
        confidence = min(hit_count / total * 0.85, 0.85)
        reason = f"Tech overlap: {hit_count} direct import{'s' if hit_count > 1 else ''} found ({', '.join(matched_techs[:3])})"
        return rid, confidence, reason

    # --- Layer 5: No match ---
    return None, 0.0, ""


# ─── Step 3: Tech stack coverage via Cypher ───────────────────────────────────

def check_tech_coverage(project: ProjectClaim, repo_id: str) -> list:
    CYPHER = """
    MATCH (n)
    WHERE n.repo_id = $repo_id
      AND ANY(kw IN $keywords WHERE
        toLower(n.name) CONTAINS kw
        OR (n:Import AND toLower(n.module_name) CONTAINS kw)
        OR (n:Function AND n.source_code IS NOT NULL
            AND toLower(substring(n.source_code, 0, 800)) CONTAINS kw)
        OR (n.file_path IS NOT NULL AND toLower(n.file_path) CONTAINS kw)
      )
    RETURN n.name AS node_name, n.file_path AS file_path,
           COALESCE(n.module_name, n.name) AS display_name
    LIMIT 20
    """
    results = []
    for tech in project.tech_stack:
        keywords = _expand_topic_keywords(tech)
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
            results.append(TechCoverageItem(tech=tech, found=found, evidence_node_ids=node_ids))
        except Exception:
            results.append(TechCoverageItem(tech=tech, found=False))
    return results


# ─── Step 4: Architecture assessment (calibrated LLM) ────────────────────────

async def assess_architecture(
    project: ProjectClaim,
    tech_coverage: list,
    repo_id: str,
    coverage_pct: int,
) -> dict:
    llm = get_llm_model(temperature=0.1)

    found_techs  = [t.tech for t in tech_coverage if t.found]
    missing_techs = [t.tech for t in tech_coverage if not t.found]

    # Fetch richer context: imports, classes, dirs, functions
    try:
        fn_rows = query_graph(
            "MATCH (f:Function) WHERE f.repo_id=$rid "
            "RETURN f.name AS name, f.file_path AS fp LIMIT 25",
            {"rid": repo_id})
        fn_sample = [f"{r.get('fp','').split('/')[-1]}:{r.get('name','')}" for r in fn_rows]
    except Exception:
        fn_sample = []

    try:
        cls_rows = query_graph(
            "MATCH (c:Class) WHERE c.repo_id=$rid RETURN c.name AS name LIMIT 20",
            {"rid": repo_id})
        cls_sample = [r.get("name","") for r in cls_rows if r.get("name")]
    except Exception:
        cls_sample = []

    try:
        imp_rows = query_graph(
            "MATCH (i:Import) WHERE i.repo_id=$rid "
            "RETURN DISTINCT i.module_name AS mod LIMIT 35",
            {"rid": repo_id})
        imp_sample = [r.get("mod","") for r in imp_rows if r.get("mod")]
    except Exception:
        imp_sample = []

    try:
        dir_rows = query_graph(
            "MATCH (f:File) WHERE f.repo_id=$rid "
            "RETURN DISTINCT split(f.path,'/')[0] AS d LIMIT 15",
            {"rid": repo_id})
        dir_sample = [r.get("d","") for r in dir_rows if r.get("d")]
    except Exception:
        dir_sample = []

    evidence = (
        f"Tech found in repo: {', '.join(found_techs) or 'none'}\n"
        f"Tech NOT found: {', '.join(missing_techs) or 'none'}\n"
        f"Tech coverage: {coverage_pct}%\n"
        f"Actual imports: {', '.join(imp_sample[:20]) or 'none'}\n"
        f"Class names: {', '.join(cls_sample[:12]) or 'none'}\n"
        f"Directory structure: {', '.join(dir_sample) or 'none'}\n"
        f"Key functions: {', '.join(fn_sample[:12]) or 'none'}"
    )

    bullets = "\n".join(f"• {b}" for b in project.bullet_claims)

    prompt = f"""You are a senior engineering interviewer verifying a project claim on a resume.

PROJECT: "{project.name}"
CLAIMED TECH STACK: {', '.join(project.tech_stack)}

CANDIDATE'S RESUME BULLETS:
{bullets}

EVIDENCE FROM MATCHED REPOSITORY:
{evidence}

CRITICAL CALIBRATION:
- coverage < 30% (tech_coverage < 30): score MUST be 0-4. Generic code patterns don't count.
- coverage 30-59%: max score is 14.
- coverage 60-79%: max score is 24.
- coverage 80%+: full rubric 0-35 applies.
Current coverage: {coverage_pct}%

For each bullet, assess if the repo evidence SPECIFICALLY supports it (not just vaguely possible).
For unsupported bullets, write a concrete missing_evidence_hint (e.g. "A publisher.py with google.cloud.pubsub imports").

Return ONLY valid JSON:
{{
  "architecture_score": <0-35>,
  "reasoning": "<2-3 sentences>",
  "bullet_verdicts": [
    {{
      "claim": "<exact bullet text>",
      "supported": true,
      "evidence_nodes": ["file.py:FunctionName"],
      "missing_evidence_hint": ""
    }}
  ]
}}"""

    try:
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        data = parse_json_response(resp.content)
        score = min(max(int(data.get("architecture_score", 0)), 0), 35)
        verdicts = [
            BulletVerdict(
                claim=v.get("claim", ""),
                supported=bool(v.get("supported", False)),
                evidence_nodes=v.get("evidence_nodes", []),
                missing_evidence_hint=v.get("missing_evidence_hint", ""),
            )
            for v in data.get("bullet_verdicts", [])
        ]
        return {"architecture_score": score, "reasoning": data.get("reasoning", ""), "bullet_verdicts": verdicts}
    except Exception as e:
        return {"architecture_score": 0, "reasoning": f"Assessment error: {e}", "bullet_verdicts": []}


# ─── Step 5: Weighted claim support score ─────────────────────────────────────

def _compute_claim_support_score(bullet_verdicts: list) -> int:
    if not bullet_verdicts:
        return 0
    total_weight = 0.0
    for v in bullet_verdicts:
        if not v.supported:
            continue
        n = len(v.evidence_nodes)
        if n >= 3:
            total_weight += 1.0
        elif n >= 1:
            total_weight += 0.7
        else:
            total_weight += 0.4
    fraction = total_weight / len(bullet_verdicts)
    return min(round(fraction * 25), 25)


# ─── Step 6: Verify one project ───────────────────────────────────────────────

async def verify_project(
    project: ProjectClaim,
    repo_id: str,
    repo_name: str,
    repo_github_url: str,
    match_confidence: float,
    match_reason: str,
) -> ProjectVerificationResult:
    tech_coverage = check_tech_coverage(project, repo_id)
    found_count   = sum(1 for t in tech_coverage if t.found)
    total_count   = max(len(tech_coverage), 1)
    tech_coverage_score = min(round((found_count / total_count) * 40), 40)
    coverage_pct  = int(found_count / total_count * 100)

    # Short-circuit: < 25% coverage → skip LLM, force Unverified
    if found_count / total_count < 0.25:
        hint = "Ingest the correct repository for this project to enable verification."
        overall = tech_coverage_score
        status = "Unverified" if overall < 35 else "Partially Verified"
        return ProjectVerificationResult(
            project_id=project.project_id,
            name=project.name,
            tech_stack=project.tech_stack,
            status=status,
            overall_score=overall,
            matched_repo_id=repo_id,
            matched_repo_name=repo_name,
            repo_github_url=repo_github_url,
            match_confidence=match_confidence,
            match_reason=match_reason,
            tech_coverage=[t.model_dump() for t in tech_coverage],
            tech_coverage_score=tech_coverage_score,
            architecture_score=0,
            claim_support_score=0,
            tech_found_count=found_count,
            tech_total_count=total_count,
            reasoning=f"Only {found_count}/{total_count} claimed technologies were found in this repository. Insufficient evidence to assess architectural claims.",
            bullet_verdicts=[BulletVerdict(claim=b, supported=False, missing_evidence_hint=hint).model_dump() for b in project.bullet_claims],
            all_evidence_node_ids=[nid for t in tech_coverage if t.found for nid in t.evidence_node_ids],
        )

    arch = await assess_architecture(project, tech_coverage, repo_id, coverage_pct)
    architecture_score  = arch["architecture_score"]
    reasoning           = arch["reasoning"]
    bullet_verdicts     = arch["bullet_verdicts"]
    claim_support_score = _compute_claim_support_score(bullet_verdicts)

    overall = tech_coverage_score + architecture_score + claim_support_score
    if overall >= 65:
        status = "Verified"
    elif overall >= 35:
        status = "Partially Verified"
    else:
        status = "Unverified"

    return ProjectVerificationResult(
        project_id=project.project_id,
        name=project.name,
        tech_stack=project.tech_stack,
        status=status,
        overall_score=overall,
        matched_repo_id=repo_id,
        matched_repo_name=repo_name,
        repo_github_url=repo_github_url,
        match_confidence=match_confidence,
        match_reason=match_reason,
        tech_coverage=[t.model_dump() for t in tech_coverage],
        tech_coverage_score=tech_coverage_score,
        architecture_score=architecture_score,
        claim_support_score=claim_support_score,
        tech_found_count=found_count,
        tech_total_count=total_count,
        reasoning=reasoning,
        bullet_verdicts=[v.model_dump() for v in bullet_verdicts],
        all_evidence_node_ids=[nid for t in tech_coverage if t.found for nid in t.evidence_node_ids],
    )


# ─── Top-level entry point ────────────────────────────────────────────────────

async def analyze_projects(resume_text: str, repo_ids: list) -> dict:
    """
    Top-level entry point for project verification.

    Candidate repos are chosen as follows:
    - If `repo_ids` is non-empty (user explicitly selected repos in this session):
        ONLY those repos are considered. Projects not matching them → "Repo Not Ingested".
        This respects the user's intent — they ingested specific repos for specific projects.
    - If `repo_ids` is empty (session expired / page refreshed with no state):
        Fall back to the full SQLite registry so results are not lost on reload.
    """
    all_registry = get_all_repos()  # [{repo_id, repo_name, github_url, owner, ...}]

    # Build a quick lookup: repo_id → registry record (most recent per URL).
    seen_urls: set = set()
    registry_by_id: dict = {}
    for r in all_registry:
        url_key = r["github_url"].lower().rstrip("/")
        if url_key not in seen_urls:
            seen_urls.add(url_key)
            registry_by_id[r["repo_id"]] = r

    if repo_ids:
        # ── User has active session repos: ONLY use those ─────────────────────
        # Resolve each session repo_id → registry record (for name/URL metadata).
        # Some IDs may not be in the de-duped registry if the same URL was
        # re-ingested; fall back to a direct get_repo_info() lookup in that case.
        candidate_repos: list = []
        for rid in repo_ids:
            if rid in registry_by_id:
                candidate_repos.append(registry_by_id[rid])
            else:
                info = get_repo_info(rid)
                if info:
                    candidate_repos.append(info)
                # If truly unknown (e.g. ingestion failed), skip silently.
    else:
        # ── No session state: fall back to full de-duped registry ─────────────
        candidate_repos = list(registry_by_id.values())

    candidate_ids: list = [r["repo_id"] for r in candidate_repos]

    # ── Build profile map only for the candidate set ──────────────────────────
    repo_profile_map = build_repo_profile_map(candidate_ids)

    repo_meta: dict = {}
    repo_url_map: dict = {}
    for r in candidate_repos:
        rid = r["repo_id"]
        repo_meta[rid]    = {"name": r["repo_name"], "url": r["github_url"]}
        repo_url_map[rid] = r["github_url"]

    projects = await parse_project_claims(resume_text)

    results = []
    for project in projects:
        matched_id, confidence, reason = match_project_to_repo(
            project, repo_profile_map, repo_url_map, repo_meta)

        if matched_id is None:
            results.append(ProjectVerificationResult(
                project_id=project.project_id,
                name=project.name,
                tech_stack=project.tech_stack,
                status="Repo Not Ingested",
                overall_score=0,
                match_reason=reason,
                tech_coverage=[TechCoverageItem(tech=t, found=False).model_dump() for t in project.tech_stack],
                reasoning="No ingested repository matched this project. Ingest the relevant GitHub repo to enable verification.",
                bullet_verdicts=[BulletVerdict(
                    claim=b, supported=False,
                    missing_evidence_hint="Ingest the project's GitHub repository first."
                ).model_dump() for b in project.bullet_claims],
            ).model_dump())
        else:
            meta = repo_meta.get(matched_id, {})
            result = await verify_project(
                project, matched_id,
                meta.get("name", matched_id[:8]),
                meta.get("url", ""),
                confidence, reason,
            )
            results.append(result.model_dump())

    verified   = sum(1 for r in results if r["status"] == "Verified")
    partial    = sum(1 for r in results if r["status"] == "Partially Verified")
    unverif    = sum(1 for r in results if r["status"] == "Unverified")
    not_ingest = sum(1 for r in results if r["status"] == "Repo Not Ingested")
    assessed   = [r for r in results if r["status"] != "Repo Not Ingested"]
    avg_score  = round(sum(r["overall_score"] for r in assessed) / max(len(assessed), 1), 1)
    avg_conf   = round(sum(r.get("match_confidence", 0) for r in assessed) / max(len(assessed), 1), 2)

    summary = ProjectSummary(
        total=len(results),
        verified=verified,
        partially_verified=partial,
        unverified=unverif,
        repo_not_ingested=not_ingest,
        average_score=avg_score,
        avg_match_confidence=avg_conf,
    )
    return {"projects": results, "summary": summary.model_dump()}


# ─── Single-project re-verification (for manual override) ────────────────────

async def verify_single_project(project_claim_dict: dict, repo_id: str) -> dict:
    """Re-verify one project against a specific repo (manual override)."""
    info = get_repo_info(repo_id)
    repo_name       = info["repo_name"] if info else repo_id[:8]
    repo_github_url = info["github_url"] if info else ""

    project = ProjectClaim(**project_claim_dict)
    result  = await verify_project(
        project, repo_id, repo_name, repo_github_url,
        match_confidence=0.5,
        match_reason=f"Manual override → {repo_name}",
    )
    return result.model_dump()

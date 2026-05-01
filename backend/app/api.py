"""
TrueSkill AI - API Routes
Implements the API contract from project specification.
"""

import re
import time
from collections import defaultdict
from functools import wraps

from typing import Optional, Union
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, field_validator

from .db import neo4j_driver, query_graph
from .ingest import ingest_repository as run_ingestion

router = APIRouter()

# =============================================================================
# Rate Limiting (Improvement #16)
# =============================================================================

_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_MAX_REQUESTS = 10  # max requests per window
RATE_LIMIT_WINDOW_SECONDS = 60  # window duration


def check_rate_limit(client_ip: str, endpoint: str) -> None:
    """
    Simple in-memory rate limiter.
    Raises HTTPException(429) if the client exceeds the limit.
    """
    key = f"{client_ip}:{endpoint}"
    now = time.time()

    # Clean old entries outside the window
    _rate_limit_store[key] = [
        ts for ts in _rate_limit_store[key]
        if now - ts < RATE_LIMIT_WINDOW_SECONDS
    ]

    if len(_rate_limit_store[key]) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {RATE_LIMIT_MAX_REQUESTS} requests per {RATE_LIMIT_WINDOW_SECONDS}s."
        )

    _rate_limit_store[key].append(now)


# =============================================================================
# Request / Response Models
# =============================================================================

# Regex for valid GitHub HTTPS URLs
GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/[\w\-\.]+/[\w\-\.]+(?:\.git)?/?$"
)

MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class IngestRequest(BaseModel):
    """Request model for repository ingestion"""
    github_url: HttpUrl

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: HttpUrl) -> HttpUrl:
        url_str = str(v)
        if not GITHUB_URL_PATTERN.match(url_str):
            raise ValueError(
                "URL must be a valid public GitHub repository (https://github.com/owner/repo)"
            )
        return v


class AnalyzeRequest(BaseModel):
    """Request model for resume analysis"""
    repo_id: str


class IngestResponse(BaseModel):
    """Response model for ingestion endpoint"""
    repo_id: str
    status: str
    message: str
    stats: Optional[dict] = None


class GraphResponse(BaseModel):
    """Response model for graph data"""
    nodes: list[dict]
    edges: list[dict]
    meta: dict = {}  # total_nodes, returned_nodes, total_edges, returned_edges, was_sampled


class GitHubRepo(BaseModel):
    name: str
    html_url: HttpUrl
    description: Optional[str] = None
    language: Optional[str] = None
    stargazers_count: int
    updated_at: str


class ExtractProfileResponse(BaseModel):
    username: str
    repos: list[GitHubRepo]


# =============================================================================
# Ingestion Endpoint
# =============================================================================

@router.post("/ingest", response_model=IngestResponse)
async def ingest_repository(request: IngestRequest, req: Request):
    """
    POST /api/ingest
    Accepts { github_url }. Triggers cloning & graph building.
    """
    check_rate_limit(req.client.host if req.client else "unknown", "ingest")

    try:
        result = await run_ingestion(str(request.github_url))
        return IngestResponse(
            repo_id=result["repo_id"],
            status=result["status"],
            message="Repository ingested successfully",
            stats=result["stats"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


# =============================================================================
# Evidence Code Drill-Down Endpoint
# =============================================================================

@router.get("/node-code/{repo_id}/{node_id:path}")
async def get_node_code(repo_id: str, node_id: str):
    """
    GET /api/node-code/{repo_id}/{node_id}

    Return source_code and metadata for a Function node given its func_id.
    node_id format matches evidence_node_ids: "file/path.py:FunctionName"
    or "file/path.py:ClassName.method_name"

    Returns 404 with a re-ingest hint if source_code was not stored
    (repos ingested before this feature was added).
    """
    try:
        results = neo4j_driver.execute_query(
            """
            MATCH (fn:Function {func_id: $func_id, repo_id: $repo_id})
            RETURN fn.source_code   AS source_code,
                   fn.name          AS name,
                   fn.file_path     AS file_path,
                   fn.line_start    AS line_start,
                   fn.line_end      AS line_end,
                   fn.complexity_score AS complexity_score,
                   fn.args          AS args,
                   fn.parent_class  AS parent_class
            LIMIT 1
            """,
            {"func_id": node_id, "repo_id": repo_id},
        )

        if not results:
            raise HTTPException(
                status_code=404,
                detail="node_not_found"
            )

        row = results[0]

        if not row.get("source_code"):
            raise HTTPException(
                status_code=404,
                detail="no_source_code"
            )

        return {
            "source_code":      row["source_code"],
            "name":             row.get("name", ""),
            "file_path":        row.get("file_path", ""),
            "line_start":       row.get("line_start"),
            "line_end":         row.get("line_end"),
            "complexity_score": row.get("complexity_score"),
            "args":             row.get("args") or [],
            "parent_class":     row.get("parent_class"),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch node code: {str(e)}")


# =============================================================================
# Extract Profile Endpoint
# =============================================================================

@router.post("/extract-profile", response_model=ExtractProfileResponse)
async def extract_profile_endpoint(
    req: Request,
    pdf_file: UploadFile = File(...)
):
    """
    POST /api/extract-profile
    Accepts { pdf_file }. Extracts GitHub username, returns public repos.
    """
    import httpx
    from PyPDF2 import PdfReader
    from io import BytesIO

    check_rate_limit(req.client.host if req.client else "unknown", "extract")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        pdf_content = await pdf_file.read()
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"PDF file too large. Maximum size is {MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB."
            )

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        extracted_uris = []

        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"
            
            # Extract Annotation URIs (Embedded Links)
            if "/Annots" in page:
                try:
                    for annot in page["/Annots"]:
                        annot_obj = annot.get_object()
                        if annot_obj.get("/Subtype") == "/Link":
                            if "/A" in annot_obj and "/URI" in annot_obj["/A"]:
                                uri = annot_obj["/A"]["/URI"]
                                extracted_uris.append(str(uri))
                except Exception:
                    pass

        if not resume_text.strip() and not extracted_uris:
            raise HTTPException(status_code=400, detail="Could not extract text or links from PDF")

        # Combine text and embedded URIs so our regex can find GitHub links in both
        search_text = resume_text + "\n" + "\n".join(extracted_uris)

        # Find GitHub username using regex
        # Match github.com/username. Username can contain alphanumeric and hyphens.
        match = re.search(r"github\.com/([a-zA-Z0-9-]+)", search_text, re.IGNORECASE)
        if not match:
            raise HTTPException(status_code=404, detail="No GitHub profile found in the resume")

        username = match.group(1)

        # Fetch repositories from GitHub API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.github.com/users/{username}/repos",
                params={"type": "owner", "sort": "updated", "per_page": 15},
                headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "TrueSkill-AI"}
            )
            
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"GitHub user '{username}' not found")
            elif response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"GitHub API error: {response.text}")

            repos_data = response.json()

            repos = []
            for r in repos_data:
                # Optionally filter out forks so we only analyze original work
                if not r.get("fork"):
                    repos.append(GitHubRepo(
                        name=r["name"],
                        html_url=r["html_url"],
                        description=r.get("description"),
                        language=r.get("language"),
                        stargazers_count=r.get("stargazers_count", 0),
                        updated_at=r.get("updated_at", "")
                    ))

            return ExtractProfileResponse(username=username, repos=repos)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


# =============================================================================
# Analysis Endpoint (with Forensics integration - Improvement #7)
# =============================================================================

@router.post("/analyze")
async def analyze_resume_endpoint(
    req: Request,
    repo_id: str,
    pdf_file: UploadFile = File(...)
):
    """
    POST /api/analyze
    Accepts { pdf_file, repo_id }. Triggers the Agent Workflow.
    Returns a Server-Sent Events (SSE) stream with progress and final JSON Report.
    """
    from PyPDF2 import PdfReader
    from io import BytesIO
    from .agents import analyze_resume_stream

    check_rate_limit(req.client.host if req.client else "unknown", "analyze")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        # Read and validate size
        pdf_content = await pdf_file.read()

        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"PDF file too large. Maximum size is {MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB."
            )

        pdf_reader = PdfReader(BytesIO(pdf_content))

        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        # Return the Server-Sent Events stream
        return StreamingResponse(
            analyze_resume_stream(resume_text, repo_id),
            media_type="text/event-stream"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# =============================================================================
# Multi-Repo Analysis Endpoint
# =============================================================================

async def _collect_analysis_result(resume_text: str, repo_id: str) -> dict:
    """
    Consume analyze_resume_stream for one repo_id and return the final 'complete' dict.
    Used internally by the multi-repo endpoint so we don't need SSE on the client.
    """
    import json
    from .agents import analyze_resume_stream

    final: dict | None = None
    async for chunk in analyze_resume_stream(resume_text, repo_id):
        raw = chunk.decode() if isinstance(chunk, (bytes, bytearray)) else str(chunk)
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                try:
                    d = json.loads(line[6:])
                    if d.get("type") == "complete":
                        final = d
                except Exception:
                    pass

    if final is None:
        return {
            "type": "complete",
            "status": "error",
            "repo_id": repo_id,
            "claims_extracted": 0,
            "claims": [],
            "verification_results": [],
            "summary": {
                "verified": 0,
                "partially_verified": 0,
                "unverified": 0,
                "total_claims": 0,
                "average_score": 0,
            },
            "errors": [f"No result returned from repo {repo_id}"],
            "authenticity_score": None,
            "forensics": None,
        }
    return final


def _merge_analysis_results(results: list[dict]) -> dict:
    """
    Merge multiple analysis results.
    - Verification results: deduplicated by topic (keep highest score for each topic).
    - Summary: recalculated from merged results.
    - authenticity_score: average of all non-None scores.
    """
    by_topic: dict[str, dict] = {}
    total_claims = 0
    all_errors: list[str] = []
    auth_scores: list[float] = []
    repo_ids: list[str] = []
    forensics_primary = None

    for r in results:
        if not r:
            continue
        rid = r.get("repo_id", "")
        if rid:
            repo_ids.append(rid)
        total_claims += r.get("claims_extracted", 0)
        all_errors.extend(r.get("errors") or [])
        a = r.get("authenticity_score")
        if a is not None:
            auth_scores.append(float(a))
        if forensics_primary is None and r.get("forensics"):
            forensics_primary = r["forensics"]

        for v in r.get("verification_results") or []:
            topic = v.get("topic", "")
            existing = by_topic.get(topic)
            if existing is None or v.get("score", 0) > existing.get("score", 0):
                by_topic[topic] = v

    merged = list(by_topic.values())
    verified = sum(1 for v in merged if v.get("status") == "Verified")
    partial = sum(1 for v in merged if v.get("status") == "Partially Verified")
    unverified = sum(1 for v in merged if v.get("status") == "Unverified")
    avg = round(sum(v.get("score", 0) for v in merged) / max(len(merged), 1), 1)
    avg_auth = round(sum(auth_scores) / len(auth_scores), 1) if auth_scores else None

    return {
        "type": "complete",
        "status": "multi_repo_complete",
        "repo_id": ",".join(repo_ids),
        "claims_extracted": total_claims,
        "claims": [],
        "verification_results": merged,
        "summary": {
            "verified": verified,
            "partially_verified": partial,
            "unverified": unverified,
            "total_claims": len(merged),
            "average_score": avg,
        },
        "errors": all_errors,
        "authenticity_score": avg_auth,
        "forensics": forensics_primary,
    }


@router.post("/analyze/multi")
async def analyze_multi_repos(
    req: Request,
    pdf_file: UploadFile = File(...),
    repo_ids: str = Form(...),   # JSON-encoded list of repo_id strings
):
    """
    POST /api/analyze/multi
    Accepts { pdf_file (multipart), repo_ids (JSON string list) }.
    Runs analysis for each repo_id and returns merged AnalysisResponse JSON.
    Non-streaming — waits for all repos to finish then returns combined result.
    """
    import json
    from PyPDF2 import PdfReader
    from io import BytesIO

    check_rate_limit(req.client.host if req.client else "unknown", "analyze-multi")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        ids: list[str] = json.loads(repo_ids)
        if not isinstance(ids, list) or not ids:
            raise ValueError("repo_ids must be a non-empty JSON array")
    except Exception:
        raise HTTPException(status_code=400, detail="repo_ids must be a valid JSON array of strings")

    try:
        pdf_content = await pdf_file.read()
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(status_code=400, detail=f"PDF too large (max {MAX_PDF_SIZE_BYTES // (1024*1024)} MB)")

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        # Run analysis for each repo and collect results
        results = []
        for repo_id in ids:
            result = await _collect_analysis_result(resume_text, repo_id)
            results.append(result)

        if not results:
            raise HTTPException(status_code=500, detail="No analysis results were produced")

        # If only one repo, return it directly (no merging needed)
        if len(results) == 1:
            return results[0]

        merged = _merge_analysis_results(results)
        return merged

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-repo analysis failed: {str(e)}")


# =============================================================================
# Graph Data Endpoint — smart sampling, multi-repo, server-side edge filter
# =============================================================================

@router.get("/graph/{repo_id}", response_model=GraphResponse)
async def get_graph_data(
    repo_id: str,
    limit: int = Query(default=5000, ge=100, le=25000, description="Max nodes to return"),
):
    """
    GET /api/graph/{repo_id}?limit=5000
    repo_id can be a single id OR comma-separated ids for multi-repo.
    Returns sampled Nodes/Edges for frontend visualization with a meta summary.

    Sampling strategy (priority order to fill `limit` slots):
      1. All File nodes       (structural backbone)
      2. All Class nodes
      3. Function nodes       (ordered by complexity_score DESC — most complex first)
      4. Import nodes         (fill remaining slots)

    Edges are returned ONLY for pairs where BOTH endpoints are in the sampled set,
    preventing dangling references that crash react-force-graph-3d.
    """
    # Parse comma-separated repo_ids for multi-repo support
    repo_ids = [r.strip() for r in repo_id.split(",") if r.strip()]
    is_multi = len(repo_ids) > 1

    # Build the WHERE clause dynamically
    if is_multi:
        where_clause = "WHERE n.repo_id IN $repo_ids"
        edge_where_clause = "WHERE a.repo_id IN $repo_ids"
        params: dict = {"repo_ids": repo_ids}
    else:
        where_clause = "WHERE n.repo_id = $repo_id"
        edge_where_clause = "WHERE a.repo_id = $repo_id"
        params = {"repo_id": repo_ids[0]}

    try:
        # ── Step 1: Count total nodes per type ──────────────────────────────
        count_query = f"""
        MATCH (n)
        {where_clause}
        RETURN labels(n)[0] AS label, count(n) AS cnt
        """
        count_results = query_graph(count_query, params)
        type_counts = {r["label"]: r["cnt"] for r in count_results if r["label"]}
        total_nodes = sum(type_counts.values())

        # ── Step 2: Fetch nodes by priority, respecting limit ───────────────
        remaining = limit
        sampled_nodes: list[dict] = []

        # Priority 1 — File nodes (always include all if possible)
        if remaining > 0:
            file_q = f"""
            MATCH (n:File)
            {where_clause}
            RETURN n, labels(n) AS labels, elementId(n) AS nodeId
            LIMIT $cap
            """
            results = query_graph(file_q, {**params, "cap": remaining})
            sampled_nodes.extend(results)
            remaining -= len(results)

        # Priority 2 — Class nodes
        if remaining > 0:
            class_q = f"""
            MATCH (n:Class)
            {where_clause}
            RETURN n, labels(n) AS labels, elementId(n) AS nodeId
            LIMIT $cap
            """
            results = query_graph(class_q, {**params, "cap": remaining})
            sampled_nodes.extend(results)
            remaining -= len(results)

        # Priority 3 — Function nodes ordered by complexity DESC
        if remaining > 0:
            func_q = f"""
            MATCH (n:Function)
            {where_clause}
            RETURN n, labels(n) AS labels, elementId(n) AS nodeId
            ORDER BY n.complexity_score DESC
            LIMIT $cap
            """
            results = query_graph(func_q, {**params, "cap": remaining})
            sampled_nodes.extend(results)
            remaining -= len(results)

        # Priority 4 — Import nodes (fill remaining slots)
        if remaining > 0:
            import_q = f"""
            MATCH (n:Import)
            {where_clause}
            RETURN n, labels(n) AS labels, elementId(n) AS nodeId
            LIMIT $cap
            """
            results = query_graph(import_q, {**params, "cap": remaining})
            sampled_nodes.extend(results)

        # ── Step 3: Build node response + collect nodeId set ────────────────
        nodes: list[dict] = []
        sampled_node_ids: set[str] = set()

        for r in sampled_nodes:
            node = r.get("n", {})
            labels = r.get("labels", [])
            node_id = r.get("nodeId", str(hash(str(node))))
            sampled_node_ids.add(node_id)

            # Determine node type for frontend coloring
            node_type = "File"
            if "Class" in labels:
                node_type = "Class"
            elif "Function" in labels:
                node_type = "Function"
            elif "Import" in labels:
                node_type = "Import"

            nodes.append({
                "id": node_id,
                "name": node.get("name", node.get("module_name", "unknown")),
                "type": node_type,
                "file_path": node.get("file_path", node.get("path", "")),
                "complexity_score": node.get("complexity_score"),
                "repo_id": node.get("repo_id", ""),
                "properties": dict(node),
            })

        # ── Step 4: Fetch edges and filter to sampled nodes only ────────────
        # Fetching a large edge set then filtering server-side prevents dangling
        # references that crash the react-force-graph-3d physics engine.
        edges_query = f"""
        MATCH (a)-[r]->(b)
        {edge_where_clause}
        RETURN elementId(a) AS sourceId, type(r) AS relationship, elementId(b) AS targetId
        LIMIT $edge_cap
        """
        # Fetch up to 4x the node limit to ensure good edge coverage after filtering
        edge_cap = min(limit * 4, 100000)
        raw_edges = query_graph(edges_query, {**params, "edge_cap": edge_cap})

        # Server-side filter: only edges where BOTH endpoints are in the sampled set
        edges: list[dict] = [
            {
                "source": r["sourceId"],
                "target": r["targetId"],
                "type": r["relationship"],
            }
            for r in raw_edges
            if r["sourceId"] in sampled_node_ids and r["targetId"] in sampled_node_ids
        ]

        was_sampled = total_nodes > len(nodes)

        return GraphResponse(
            nodes=nodes,
            edges=edges,
            meta={
                "total_nodes": total_nodes,
                "returned_nodes": len(nodes),
                "total_edges": len(raw_edges),
                "returned_edges": len(edges),
                "was_sampled": was_sampled,
                "repo_ids": repo_ids,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph query failed: {str(e)}")


@router.get("/health/db")
async def database_health():
    """Check Neo4j database connectivity"""
    is_connected = neo4j_driver.verify_connectivity()
    if is_connected:
        return {"status": "connected", "database": "neo4j"}
    raise HTTPException(status_code=503, detail="Database connection failed")


# =============================================================================
# Coach Module - Gap Analysis & Bridge Projects
# =============================================================================

class CoachRequestModel(BaseModel):
    """Request model for coach endpoint"""
    verified_skills: list[dict]  # [{topic, score, status}, ...]
    job_description: str
    num_projects: int = 3        # Configurable number of bridge project suggestions (1-5)


@router.post("/coach")
async def generate_coach_plan(request: CoachRequestModel, req: Request):
    """
    POST /api/coach
    Compares verified skills against job description.
    Returns N configurable bridge projects (default 3) ranked by impact.
    """
    from .coach import generate_bridge_projects, VerifiedSkill

    check_rate_limit(req.client.host if req.client else "unknown", "coach")

    try:
        # Convert dict skills to VerifiedSkill objects
        skills = [
            VerifiedSkill(
                topic=s.get("topic", ""),
                score=s.get("score", 0),
                status=s.get("status", "Unverified")
            )
            for s in request.verified_skills
        ]

        if not request.job_description.strip():
            raise HTTPException(status_code=400, detail="Job description cannot be empty")

        num = max(1, min(5, request.num_projects))
        projects, gap_summary = await generate_bridge_projects(skills, request.job_description, num_projects=num)

        return {
            "status": "success",
            "gap_analysis_summary": gap_summary,
            "bridge_projects": [p.model_dump() for p in projects],
            # Backward-compat: first project as singular field
            "bridge_project": projects[0].model_dump() if projects else None,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coach generation failed: {str(e)}")


# =============================================================================
# Skill Timeline Endpoint (Feature 8)
# =============================================================================

@router.get("/skill-timeline/{repo_id}")
async def get_skill_timeline(repo_id: str):
    """
    GET /api/skill-timeline/{repo_id}
    Returns file dates grouped by language for timeline visualization.
    """
    try:
        results = neo4j_driver.execute_query(
            """
            MATCH (f:File {repo_id: $repo_id})
            RETURN f.name AS name, f.path AS path, f.language AS language,
                   f.first_seen AS first_seen, f.last_modified AS last_modified
            """,
            {"repo_id": repo_id}
        )

        # Group by language
        by_language: dict[str, list] = {}
        for r in results:
            lang = r.get("language", "unknown") or "unknown"
            if lang not in by_language:
                by_language[lang] = []
            by_language[lang].append({
                "name": r.get("name"),
                "path": r.get("path"),
                "first_seen": r.get("first_seen"),
                "last_modified": r.get("last_modified"),
            })

        return {"repo_id": repo_id, "timeline": by_language}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Timeline fetch failed: {str(e)}")


# =============================================================================
# Forensics / Authorship Endpoint (Feature 1)
# =============================================================================

@router.get("/forensics/{repo_id}")
async def get_forensics(repo_id: str):
    """
    GET /api/forensics/{repo_id}
    Returns authorship and stylometric analysis for a repository.
    """
    try:
        # Query graph for repo metadata
        results = neo4j_driver.execute_query(
            """
            MATCH (f:File {repo_id: $repo_id})
            OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function {repo_id: $repo_id})
            RETURN f.name AS file_name, f.language AS language,
                   f.author_email AS author_email,
                   f.commit_count AS commit_count,
                   f.first_seen AS first_seen, f.last_modified AS last_modified,
                   fn.complexity_score AS complexity
            """,
            {"repo_id": repo_id}
        )

        # Aggregate authorship data
        author_emails: dict[str, int] = {}
        total_files = 0
        languages: dict[str, int] = {}

        for r in results:
            email = r.get("author_email")
            if email:
                author_emails[email] = author_emails.get(email, 0) + 1
            lang = r.get("language")
            if lang:
                languages[lang] = languages.get(lang, 0) + 1
            if r.get("file_name"):
                total_files += 1

        return {
            "repo_id": repo_id,
            "total_files": total_files,
            "author_emails": author_emails,
            "languages": languages,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forensics fetch failed: {str(e)}")


# =============================================================================
# Export Report Endpoint (Feature 5)
# =============================================================================

@router.post("/export-report")
async def export_report(req: Request):
    """
    POST /api/export-report
    Accepts analysis results JSON, returns downloadable HTML report.
    """
    from .report import generate_html_report

    try:
        data = await req.json()
        html = generate_html_report(data)
        return StreamingResponse(
            iter([html]),
            media_type="text/html",
            headers={"Content-Disposition": "attachment; filename=trueskill_report.html"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


# =============================================================================
# Candidate Storage Endpoints (Feature 4)
# =============================================================================

@router.post("/analyses")
async def save_analysis(req: Request):
    """Save an analysis result for later comparison."""
    from .storage import save_analysis as _save
    try:
        data = await req.json()
        analysis_id = _save(data)
        return {"status": "success", "analysis_id": analysis_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses")
async def list_analyses():
    """List all saved analyses."""
    from .storage import list_analyses as _list
    try:
        return {"analyses": _list()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Get a specific saved analysis."""
    from .storage import get_analysis as _get
    try:
        result = _get(analysis_id)
        if not result:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compare")
async def compare_analyses(ids: str):
    """Compare multiple analyses. Pass comma-separated IDs."""
    from .storage import get_analysis as _get
    try:
        id_list = [i.strip() for i in ids.split(",") if i.strip()]
        results = []
        for aid in id_list:
            a = _get(aid)
            if a:
                results.append(a)
        return {"analyses": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ATS Score Endpoint
# =============================================================================

@router.post("/ats-score")
async def ats_score_endpoint(
    req: Request,
    job_description: str = Form(...),
    pdf_file: UploadFile = File(...),
):
    """
    POST /api/ats-score
    Accepts { pdf_file, job_description }. Runs ATS evaluation via LLM.
    Returns ATSReport JSON.
    """
    from PyPDF2 import PdfReader
    from io import BytesIO
    from .ats import score_resume_ats

    check_rate_limit(req.client.host if req.client else "unknown", "ats-score")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    if not job_description or not job_description.strip():
        raise HTTPException(status_code=400, detail="job_description cannot be empty")

    try:
        pdf_content = await pdf_file.read()

        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"PDF file too large. Maximum size is {MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB.",
            )

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        report = await score_resume_ats(resume_text, job_description)
        return report.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ATS scoring failed: {str(e)}")


# =============================================================================
# ATS Report Download Endpoint
# =============================================================================

@router.post("/ats-report")
async def ats_report_endpoint(req: Request):
    """
    POST /api/ats-report
    Accepts { ats_report: dict, candidate_name: str }.
    Returns a downloadable self-contained HTML ATS report.
    """
    from .ats import generate_ats_html_report

    try:
        data = await req.json()
        ats_report = data.get("ats_report", {})
        candidate_name = data.get("candidate_name", "Candidate")

        if not ats_report:
            raise HTTPException(status_code=400, detail="ats_report payload is required")

        html = generate_ats_html_report(ats_report, candidate_name)
        return StreamingResponse(
            iter([html]),
            media_type="text/html",
            headers={"Content-Disposition": "attachment; filename=ats_report.html"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ATS report generation failed: {str(e)}")


# =============================================================================
# Resume Toolkit — Find Jobs (Jooble)
# =============================================================================

class FindJobsResponse(BaseModel):
    profile: dict
    jobs: list[dict]
    total: int


@router.post("/resume-toolkit/find-jobs")
async def resume_toolkit_find_jobs(
    req: Request,
    pdf_file: UploadFile = File(...),
    location_override: Optional[str] = Form(None),
):
    """
    POST /api/resume-toolkit/find-jobs
    Accepts { pdf_file, location_override? }.
    Infers role + location from resume via LLM, then searches Jooble.
    Returns inferred profile + list of job postings.
    """
    from PyPDF2 import PdfReader
    from io import BytesIO
    from .job_finder import extract_role_location, search_jobs

    check_rate_limit(req.client.host if req.client else "unknown", "resume-toolkit-jobs")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        pdf_content = await pdf_file.read()
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="PDF too large (max 10 MB)")

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        # Infer role + location via LLM
        profile = await extract_role_location(resume_text)

        # Override location if provided
        location = location_override.strip() if location_override else profile.location

        # Search Jooble
        jobs = await search_jobs(role=profile.role, location=location)

        return {
            "profile": profile.model_dump(),
            "jobs": [j.model_dump() for j in jobs],
            "total": len(jobs),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job search failed: {str(e)}")


# =============================================================================
# Resume Toolkit — Optimize Keywords (ATS Rewriter)
# =============================================================================

@router.post("/resume-toolkit/optimize-keywords")
async def resume_toolkit_optimize_keywords(
    req: Request,
    pdf_file: UploadFile = File(...),
    job_description: str = Form(...),
    missing_keywords: str = Form("[]"),   # JSON-encoded list sent as form string
):
    """
    POST /api/resume-toolkit/optimize-keywords
    Accepts { pdf_file (multipart), job_description, missing_keywords (JSON list) }.
    Extracts resume text from PDF server-side, then rewrites Skills/Summary section.
    """
    import json
    from PyPDF2 import PdfReader
    from io import BytesIO
    from .resume_optimizer import optimize_resume_keywords

    check_rate_limit(req.client.host if req.client else "unknown", "resume-toolkit-optimize")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    if not job_description.strip():
        raise HTTPException(status_code=400, detail="job_description cannot be empty")

    try:
        # Parse missing_keywords from JSON string
        try:
            kw_list: list[str] = json.loads(missing_keywords) if missing_keywords else []
            if not isinstance(kw_list, list):
                kw_list = []
        except Exception:
            kw_list = []

        # Extract text from PDF server-side
        pdf_content = await pdf_file.read()
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="PDF too large (max 10 MB)")

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        result = await optimize_resume_keywords(
            resume_text=resume_text,
            job_description=job_description,
            missing_keywords=kw_list,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Keyword optimization failed: {str(e)}")


# =============================================================================
# Resume Toolkit — Find Hiring Manager (Apollo.io)
# =============================================================================

class FindHiringManagerRequest(BaseModel):
    company_name: str
    job_title: str
    company_domain: str = ""


@router.post("/resume-toolkit/find-hiring-manager")
async def resume_toolkit_find_hiring_manager(
    request: FindHiringManagerRequest,
    req: Request,
):
    """
    POST /api/resume-toolkit/find-hiring-manager
    Accepts { company_name, job_title, company_domain? }.
    Returns enhanced hiring manager info:
      - primary contact (Apollo or pattern)
      - alternatives (up to 2 more)
      - LLM-generated search suggestions
      - email patterns
      - LinkedIn search URLs
    """
    from .job_finder import find_hiring_manager_enhanced

    check_rate_limit(req.client.host if req.client else "unknown", "resume-toolkit-manager")

    if not request.company_name.strip():
        raise HTTPException(status_code=400, detail="company_name cannot be empty")

    try:
        result = await find_hiring_manager_enhanced(
            company_name=request.company_name,
            job_title=request.job_title,
            company_domain=request.company_domain,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hiring manager search failed: {str(e)}")


# =============================================================================
# Resume Toolkit — Draft Outreach Email
# =============================================================================

@router.post("/resume-toolkit/draft-email")
async def resume_toolkit_draft_email(
    req: Request,
    pdf_file: UploadFile = File(...),
    job_posting: str = Form(...),        # JSON-encoded dict
    hiring_manager: str = Form("{}"),   # JSON-encoded dict
):
    """
    POST /api/resume-toolkit/draft-email
    Accepts { pdf_file (multipart), job_posting (JSON string), hiring_manager (JSON string) }.
    Extracts resume text from PDF server-side, then drafts a personalized email.
    """
    import json
    from PyPDF2 import PdfReader
    from io import BytesIO
    from .resume_optimizer import draft_outreach_email

    check_rate_limit(req.client.host if req.client else "unknown", "resume-toolkit-email")

    if not pdf_file.filename or not pdf_file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        job_posting_dict: dict = json.loads(job_posting)
        hiring_manager_dict: dict = json.loads(hiring_manager) if hiring_manager else {}
    except Exception:
        raise HTTPException(status_code=400, detail="job_posting and hiring_manager must be valid JSON")

    if not job_posting_dict:
        raise HTTPException(status_code=400, detail="job_posting cannot be empty")

    try:
        # Extract text from PDF server-side
        pdf_content = await pdf_file.read()
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="PDF too large (max 10 MB)")

        pdf_reader = PdfReader(BytesIO(pdf_content))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text() + "\n"

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        result = await draft_outreach_email(
            resume_text=resume_text,
            job_posting=job_posting_dict,
            hiring_manager=hiring_manager_dict,
        )
        return result.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email drafting failed: {str(e)}")


# =============================================================================
# Feature 1 — Shareable Verified Badge
# =============================================================================

@router.post("/analyses/{analysis_id}/share")
async def share_analysis(analysis_id: str):
    """
    POST /api/analyses/{analysis_id}/share
    Makes an analysis publicly shareable. Returns a share_token that can be
    embedded in /profile/{token} URLs.
    """
    from .storage import make_shareable
    token = make_shareable(analysis_id)
    if not token:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {
        "status": "shared",
        "share_token": token,
        "profile_url": f"/profile/{token}",
    }


@router.get("/profile/{share_token}")
async def get_public_profile(share_token: str):
    """
    GET /api/profile/{share_token}
    Returns a public (read-only) analysis result for the given share token.
    No authentication required — secured by the unguessable token.
    """
    from .storage import get_analysis_by_token
    data = get_analysis_by_token(share_token)
    if not data:
        raise HTTPException(status_code=404, detail="Profile not found or not public")
    return data


# =============================================================================
# Feature 2 — Skill Radar Benchmarks
# =============================================================================

@router.get("/benchmarks")
async def list_benchmarks():
    """GET /api/benchmarks — list all available seeded role benchmarks."""
    from .benchmarks import list_available_roles
    return {"roles": list_available_roles()}


@router.get("/benchmarks/{role_slug}")
async def get_role_benchmark(role_slug: str):
    """
    GET /api/benchmarks/{role_slug}
    Returns benchmark skill scores for a named engineering role.
    Supports slugs like: software-engineer, ml-engineer, data-scientist, devops-engineer, etc.
    """
    from .benchmarks import get_benchmark
    result = get_benchmark(role_slug)
    if result["source"] == "not_found":
        raise HTTPException(
            status_code=404,
            detail=f"No seeded benchmark for '{role_slug}'. Use POST /api/benchmarks/generate for custom roles."
        )
    return result


class BenchmarkGenerateRequest(BaseModel):
    role_description: str
    skill_topics: list[str] = []


@router.post("/benchmarks/generate")
async def generate_benchmark(request: BenchmarkGenerateRequest, req: Request):
    """
    POST /api/benchmarks/generate
    Generate a benchmark for any custom role using the LLM.
    Body: { role_description: "Senior GenAI Engineer", skill_topics: ["Python", "LLMs", ...] }
    """
    from .benchmarks import get_benchmark_llm
    check_rate_limit(req.client.host if req.client else "unknown", "benchmark-generate")
    try:
        result = await get_benchmark_llm(
            role_description=request.role_description,
            skill_topics=request.skill_topics,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark generation failed: {str(e)}")


# =============================================================================
# Feature 4 — Contribution Heatmap
# =============================================================================

@router.get("/heatmap/{repo_id}")
async def get_contribution_heatmap(repo_id: str):
    """
    GET /api/heatmap/{repo_id}
    Returns 52 weeks of commit activity for the repository using the GitHub API.
    Data: [{ week: epoch_timestamp, total: int, days: [int x7] }, ...]
    """
    import httpx
    from .storage import get_repo_info

    info = get_repo_info(repo_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail="Repository not found. Re-ingest the repo to enable heatmap data."
        )

    owner = info["owner"]
    repo_name = info["repo_name"]
    github_token = os.environ.get("GITHUB_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "TrueSkill-AI",
    }
    if github_token:
        headers["Authorization"] = f"token {github_token}"

    url = f"https://api.github.com/repos/{owner}/{repo_name}/stats/commit_activity"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # GitHub may return 202 (computing) on first call — retry once
            for attempt in range(2):
                response = await client.get(url, headers=headers)
                if response.status_code == 202:
                    import asyncio
                    await asyncio.sleep(3)
                    continue
                if response.status_code == 404:
                    raise HTTPException(status_code=404, detail="GitHub repository not found or is private")
                if response.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"GitHub API error: {response.status_code}")
                break

        weeks = response.json() if response.status_code == 200 else []

        # Compute summary stats
        total_commits = sum(w.get("total", 0) for w in weeks)
        active_weeks = sum(1 for w in weeks if w.get("total", 0) > 0)
        peak_week = max(weeks, key=lambda w: w.get("total", 0), default={})

        return {
            "repo_id": repo_id,
            "owner": owner,
            "repo_name": repo_name,
            "weeks": weeks,          # 52 items, each: {week, total, days[7]}
            "summary": {
                "total_commits": total_commits,
                "active_weeks": active_weeks,
                "inactive_weeks": 52 - active_weeks,
                "peak_week_commits": peak_week.get("total", 0),
                "consistency_score": round((active_weeks / 52) * 100),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap fetch failed: {str(e)}")


# =============================================================================
# Feature 5 — AI Interview Question Generator
# =============================================================================

class InterviewQuestionsRequest(BaseModel):
    topic: str
    claim_text: str
    difficulty: int = 3
    evidence_node_ids: list[str] = []
    code_snippets: list[str] = []
    reasoning: str = ""
    num_questions: int = 5


@router.post("/interview-questions")
async def generate_interview_questions_endpoint(
    request: InterviewQuestionsRequest,
    req: Request,
):
    """
    POST /api/interview-questions
    Generates personalised technical interview questions for a verified skill claim.
    Uses the actual code evidence (function names, imports) found during verification.
    """
    from .interview import generate_interview_questions
    check_rate_limit(req.client.host if req.client else "unknown", "interview-questions")

    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="topic cannot be empty")

    try:
        result = await generate_interview_questions(
            topic=request.topic,
            claim_text=request.claim_text,
            difficulty=request.difficulty,
            evidence_node_ids=request.evidence_node_ids,
            code_snippets=request.code_snippets,
            reasoning=request.reasoning,
            num_questions=request.num_questions,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interview question generation failed: {str(e)}")


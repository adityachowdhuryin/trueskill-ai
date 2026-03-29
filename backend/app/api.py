"""
TrueSkill AI - API Routes
Implements the API contract from project specification.
"""

import re
import time
from collections import defaultdict
from functools import wraps

from typing import Optional, Union
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
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
# Graph Data Endpoint (Improvement #4 — backend side)
# =============================================================================

@router.get("/graph/{repo_id}", response_model=GraphResponse)
async def get_graph_data(repo_id: str):
    """
    GET /api/graph/{repo_id}
    Returns Nodes/Edges for frontend visualization.
    """
    # Query all nodes and relationships for the repository
    nodes_query = """
    MATCH (n)
    WHERE n.repo_id = $repo_id OR $repo_id = 'all'
    RETURN n, labels(n) as labels, elementId(n) as nodeId
    LIMIT 1000
    """

    edges_query = """
    MATCH (a)-[r]->(b)
    WHERE a.repo_id = $repo_id OR $repo_id = 'all'
    RETURN elementId(a) as sourceId, type(r) as relationship, elementId(b) as targetId
    LIMIT 1000
    """

    try:
        nodes_result = query_graph(nodes_query, {"repo_id": repo_id})
        edges_result = query_graph(edges_query, {"repo_id": repo_id})

        nodes = []
        for r in nodes_result:
            node = r.get("n", {})
            labels = r.get("labels", [])
            node_id = r.get("nodeId", str(hash(str(node))))

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
                "properties": dict(node),
            })

        edges = [
            {
                "source": r["sourceId"],
                "target": r["targetId"],
                "type": r["relationship"]
            }
            for r in edges_result
        ]

        return GraphResponse(nodes=nodes, edges=edges)
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


@router.post("/coach")
async def generate_coach_plan(request: CoachRequestModel, req: Request):
    """
    POST /api/coach
    Compares verified skills against job description.
    Returns a bridge project to close the most critical skill gap.
    """
    from .coach import generate_bridge_project, VerifiedSkill

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

        result = await generate_bridge_project(skills, request.job_description)

        return {
            "status": "success",
            "bridge_project": result.model_dump()
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


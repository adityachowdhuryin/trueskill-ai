# PROJECT SPECIFICATION: TrueSkill AI (MSc Thesis)

## 1. Project Overview
**Title:** TrueSkill AI: Automated Competency Verification System  
**Type:** Master's Thesis Final Project  
**Core Value:** A multi-agent system that verifies claims on a PDF resume by cross-referencing them with actual code analysis from a GitHub repository using GraphRAG (Graph-based Retrieval Augmented Generation).

---

## 2. Technical Architecture

### 2.1 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **3D Graph** | react-force-graph-3d, Three.js |
| **Charts** | Recharts |
| **Backend** | Python 3.11+, FastAPI, Pydantic v2 |
| **AI Orchestration** | LangChain, LangGraph |
| **LLM** | Groq — Llama 3.3 70B (`langchain_groq`) |
| **AST Parsing** | tree-sitter (Python, JS, TS, Go, Java, Rust) |
| **Graph Database** | Neo4j (Docker local or AuraDB Free Tier) |
| **Relational Storage** | SQLite (`trueskill_analyses.db`) via `storage.py` |
| **HTTP Client** | httpx (async, for GitHub API / Jooble / Apollo.io) |
| **PDF Parser** | PyPDF2 |

### 2.2 System Modules

| Module | File | Description |
|---|---|---|
| **Ingestion Engine** | `ingest.py` | Clone repos, parse ASTs via tree-sitter, build Neo4j graph |
| **Reasoning Core** | `agents.py` | LangGraph Parser → Auditor → Grader pipeline |
| **Forensics** | `forensics.py` | Stylometric authorship & AI-code detection |
| **ATS Scorer** | `ats.py` | Resume vs JD evaluation, HTML report generation |
| **Coach Module** | `coach.py` | Gap analysis → bridge project suggestions |
| **Job Finder** | `job_finder.py` | Jooble job search + Apollo.io hiring manager lookup |
| **Resume Optimizer** | `resume_optimizer.py` | LLM keyword rewriting + personalized email drafting |
| **Report Generator** | `report.py` | Self-contained HTML verification report |
| **Storage** | `storage.py` | SQLite CRUD for saving & comparing analyses |
| **Database** | `db.py` | Neo4j driver + `query_graph()` helper |
| **LLM Client** | `llm.py` | Shared Gemini 2.5 Flash client + JSON parser |
| **API** | `api.py` | 18+ FastAPI endpoints with rate limiting |

---

## 3. Data Models (Strict Schema)

### 3.1 Graph Database Schema (Neo4j)

**Nodes:**
```
(:File   { name, path, language, repo_id })
(:Class  { name, line_start, line_end, file_path, repo_id, bases[] })
(:Function { name, args[], complexity_score, line_start, line_end, file_path, repo_id, parent_class, calls[] })
(:Import { module_name, file_path, repo_id })
```

**Relationships:**
```
(:Function)-[:CALLS]->(:Function)
(:Class)-[:INHERITS_FROM]->(:Class)
(:File)-[:CONTAINS]->(:Class|:Function)
(:File)-[:IMPORTS]->(:Import)
```

### 3.2 Domain Objects (Pydantic)

**Resume Claim extraction:**
```python
class ResumeClaim(BaseModel):
    topic: str          # e.g. "Python", "Machine Learning"
    claim_text: str     # Exact claim from resume
    difficulty: int     # 1-5 expertise level
```

**Verification result (per claim):**
```python
class VerificationResult(BaseModel):
    claim_id: str
    topic: str
    claim_text: str
    status: str         # "Verified" | "Partially Verified" | "Unverified"
    score: int          # 0-100
    evidence_node_ids: list[str]
    reasoning: str
    complexity_analysis: str
```

**Graph evidence:**
```python
class GraphEvidence(BaseModel):
    node_ids: list[str]
    node_types: list[str]
    code_snippets: list[str]
    complexity_scores: list[int]
    cypher_query: str
    raw_results: list[dict]
```

**ATS evaluation:**
```python
class ATSReport(BaseModel):
    ats_score: int                      # Weighted: (kw*0.45) + (content*0.35) + (format*0.20)
    keyword_match_score: int
    format_score: int
    content_score: int
    keyword_matches: list[KeywordMatch]
    section_feedback: list[SectionFeedback]
    top_missing_keywords: list[str]
    formatting_flags: list[str]
    overall_recommendation: str
    strengths: list[str]
    improvements: list[str]
```

**SQLite analyses table:**
```sql
CREATE TABLE analyses (
    id TEXT PRIMARY KEY,
    candidate_name TEXT,
    repo_names TEXT,    -- JSON array
    repo_ids TEXT,      -- JSON array
    results_json TEXT,
    skills_json TEXT,
    overall_score REAL,
    created_at TEXT
)
```

---

## 4. Agent Workflows (LangGraph)

### Workflow 1: The Verification Loop
Runs as a LangGraph `StateGraph` with streaming SSE output:

```
START → Parser Node → Auditor Node → Grader Node → END
```

1. **Parser (Node A):** Resume text → `List[ResumeClaim]` via Gemini 2.5 Flash
2. **Auditor (Node B):** Per claim → topic-synonym expansion → Cypher query → `GraphEvidence`
3. **Grader (Node C):** Evidence + LLM analysis → `VerificationResult` (0–100 score)

**Scoring formula:**
- +30 base if evidence nodes exist
- +5 per node (max +20)
- +20 if code complexity matches claimed difficulty level
- +30 from LLM reasoning quality assessment

**Topic synonym expansion** (`TOPIC_SYNONYMS` map) covers 15+ tech domains for broader graph matching.

### Workflow 2: The ATS Pipeline
Standalone async call (no graph dependency):

1. **Input:** PDF resume + job description text
2. **LLM analysis:** Gemini extracts keywords, scores sections (Summary, Experience, Skills, Education)
3. **Output:** `ATSReport` + downloadable HTML report

### Workflow 3: AI Resume Toolkit (4-Step)
Multi-step sequential workflow available at `/resume-toolkit`:

1. **Job Search** — PDF → LLM infers role + location → Jooble API → ranked job list
2. **ATS Optimization** — PDF + JD → keyword gap analysis → LLM rewrites Skills/Summary
3. **Hiring Manager Lookup** — Company name + title → Apollo.io search → email pattern guess
4. **Email Drafting** — PDF + job posting + hiring manager → LLM-personalized cold email

### Workflow 4: Skill Coaching
1. **Input:** `VerifiedSkills[]` + job description text
2. **Logic:** Identify gaps (score < 50) + missing JD keywords
3. **Output:** `BridgeProject` with title, tech stack, and step-by-step build instructions

---

## 5. API Contract (FastAPI)

All endpoints are registered under `/api` prefix with in-memory rate limiting (10 req/60s per client IP).

### Core Pipeline
```
POST   /api/ingest                     { github_url }           → IngestResponse
POST   /api/extract-profile            { pdf_file }             → ExtractProfileResponse
POST   /api/analyze                    { pdf_file, repo_id }    → SSE stream (progress + JSON)
GET    /api/graph/{repo_id}                                     → GraphResponse
GET    /api/skill-timeline/{repo_id}                           → timeline by language
GET    /api/forensics/{repo_id}                                → authorship + stylometry
```

### Saved Analyses
```
POST   /api/analyses                   { ...analysis_data }     → { analysis_id }
GET    /api/analyses                                            → { analyses: [] }
GET    /api/analyses/{id}                                       → analysis dict
GET    /api/compare?ids=id1,id2                                → { analyses: [] }
```

### Career & ATS Tools
```
POST   /api/coach                      { verified_skills, job_description }
POST   /api/ats-score                  { pdf_file, job_description }        → ATSReport
POST   /api/ats-report                 { ats_report, candidate_name }       → HTML download
POST   /api/export-report              { ...results }                        → HTML download
```

### Resume Toolkit
```
POST   /api/resume-toolkit/find-jobs             { pdf_file, location_override? }
POST   /api/resume-toolkit/optimize-keywords     { pdf_file, job_description, missing_keywords }
POST   /api/resume-toolkit/find-hiring-manager   { company_name, job_title, company_domain? }
POST   /api/resume-toolkit/draft-email           { pdf_file, job_posting, hiring_manager }
```

---

## 6. Thesis-Specific Requirements (Implemented)

| Requirement | Status | Implementation |
|---|---|---|
| **Cyclomatic Complexity** | ✅ Implemented | `ingest.py` — full AST traversal counts decision points (if/for/while/except/and/or/ternary). Grader scores against claimed difficulty level. |
| **Stylometry** | ✅ Implemented | `forensics.py` — Shannon entropy of snake_case/camelCase/PascalCase distribution, git history bulk-commit detection, authenticity score 0–100. |
| **Explainability** | ✅ Implemented | Every `VerificationResult` returns `evidence_node_ids` (file:function references); frontend `GraphVisualizer` can highlight them in the 3D graph. |
| **Multi-language support** | ✅ Implemented | tree-sitter parsers for Python, JavaScript, TypeScript, Go, Java, Rust. |
| **Streaming results** | ✅ Implemented | `/api/analyze` returns SSE with live per-node progress then final JSON. |
| **Candidate comparison** | ✅ Implemented | SQLite persistence + `/compare` frontend page. |
| **ATS evaluation** | ✅ Implemented | `ats.py` — weighted keyword/content/format scoring + downloadable report. |

---

## 7. Frontend Pages

| Route | Component | Description |
|---|---|---|
| `/` | `page.tsx` | Animated landing page with feature cards + tech stack footer |
| `/dashboard` | `dashboard/page.tsx` | Main workflow: upload PDF → select repo → run analysis → view results + 3D graph |
| `/compare` | `compare/page.tsx` | Side-by-side multi-candidate comparison with gauge charts |
| `/resume-toolkit` | `resume-toolkit/page.tsx` | 4-step AI Resume Toolkit (Jobs → ATS → Manager → Email) |

---

## 8. Deployment

### Local Development
```bash
python start_all.py   # starts Neo4j + FastAPI + Next.js
```

### Docker (Production)
```bash
docker compose up -d   # all 3 services
```

### Required Environment Variables
```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=trueskill_password

# Groq (required — powers all LLM calls via langchain_groq)
GROQ_API_KEY=your_groq_api_key_here

# GitHub Token (optional — avoids public API rate limits)
GITHUB_TOKEN=your_github_token_here

# Optional
JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key
```
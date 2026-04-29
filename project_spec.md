# PROJECT SPECIFICATION: TrueSkill AI (MSc Data science Thesis)

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
| **Graph Database** | Neo4j AuraDB (cloud free tier) — `neo4j+s://` protocol |
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
| **Database** | `db.py` | Neo4j AuraDB driver + `query_graph()` helper; supports `NEO4J_USERNAME` / `NEO4J_DATABASE` |
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
    created_at TEXT,
    is_public INTEGER DEFAULT 0,
    share_token TEXT    -- random URL-safe token for public profile sharing
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

**`claim_id` uniqueness:** Each claim is assigned an ID prefixed with the first 6 characters of `repo_id` (e.g. `abc123_0`). This prevents collisions when results from multiple repo analysis runs are merged by topic — duplicate `claim_0` IDs from separate runs no longer cause React key warnings or incorrect evidence attribution.

**`_generate_summary()` consistency:** Both the empty-result path and the normal path return identical keys (`verified`, `partially_verified`, `unverified`, `total_claims`, `average_score`) matching the frontend `AnalysisResponse` TypeScript type.

### Workflow 2: The ATS Pipeline
Standalone async call (no graph dependency):

1. **Input:** PDF resume + job description text
2. **LLM analysis:** Gemini extracts keywords, scores sections (Summary, Experience, Skills, Education)
3. **Output:** `ATSReport` + downloadable HTML report

### Workflow 3: AI Resume Toolkit (4-Step)
Multi-step sequential workflow available at `/resume-toolkit`:

1. **Job Search** — PDF → LLM infers role + location → Jooble API → ranked job list
2. **ATS Optimization** — PDF + JD → keyword gap analysis → LLM rewrites Skills/Summary
3. **Hiring Manager Lookup** — Company name + title → Apollo.io `/people/search` (paid plan) → `/people/match` (free tier) → email pattern guess
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
POST   /api/analyze/multi              { pdf_file, repo_ids[] } → merged AnalysisResponse JSON
GET    /api/graph/{repo_id}?limit=5000                          → GraphResponse (nodes, edges, meta)
         # repo_id can be comma-separated for multi-repo: /api/graph/id1,id2
         # ?limit=N controls max nodes (default 5000, max 25000)
         # meta field: { total_nodes, returned_nodes, was_sampled, repo_ids[] }
GET    /api/skill-timeline/{repo_id}                           → timeline by language
GET    /api/forensics/{repo_id}                                → authorship + stylometry
```

### Saved Analyses
```
POST   /api/analyses                   { ...analysis_data }     → { analysis_id }
GET    /api/analyses                                            → { analyses: [] }
GET    /api/analyses/{id}                                       → analysis dict
GET    /api/compare?ids=id1,id2                                → { analyses: [] }
POST   /api/analyses/{id}/share                                → { share_token, profile_url }
GET    /api/profile/{token}                                    → public analysis dict (no auth)
```

### Benchmarks & Interview Prep
```
POST   /api/benchmarks/generate        { role_description, skill_topics[] } → { scores: {topic: int} }
POST   /api/interview-questions        { topic, claim_text, difficulty, num_questions } → { questions[] }
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
         # Priority: Apollo /people/search (paid) → /people/match (free tier) → LLM pattern
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
| `/dashboard` | `dashboard/page.tsx` | Main workflow: upload PDF → select repo → run analysis → tabbed results (Skills / Radar / Activity / Graph) |
| `/compare` | `compare/page.tsx` | Side-by-side multi-candidate comparison with gauge charts |
| `/resume-toolkit` | `resume-toolkit/page.tsx` | 4-step AI Resume Toolkit (Jobs → ATS → Manager → Email) |
| `/profile/[token]` | `profile/[id]/page.tsx` | Public shareable verified profile page (no auth required) |

### Dashboard Tabs
| Tab | Description |
|---|---|
| **Skills** | Sorted skill cards (Verified → Partial → Unverified). Filter toolbar: search by name, filter by status, Expand All / Collapse All. Each card shows animated score bar, parsed code evidence (file → function), AI reasoning, complexity analysis, and AI Interview Prep questions. |
| **Radar** | Skill radar chart comparing verified scores vs LLM-generated role benchmarks (via `POST /api/benchmarks/generate`). Shows gap analysis cards and summary pills. |
| **Activity** | Contribution heatmap + language skill timeline. |
| **Graph** | Interactive 3D force-graph of the Neo4j knowledge graph. |

### Key Frontend Components
| Component | Description |
|---|---|
| `SkillCard.tsx` | Per-claim card: animated score bar, parsed evidence nodes (file type badge + file→function), sectioned layout, Interview Prep with collapsible hints + Copy All |
| `SkillRadar.tsx` | Recharts radar: fetches LLM benchmarks on-demand via `POST /api/benchmarks/generate` so traces always align |
| `ContributionHeatmap.tsx` | GitHub-style commit heatmap |
| `SkillTimeline.tsx` | Language timeline chart |
| `GraphVisualizer.tsx` | 3D force-graph with smart sampling banner |
| `VerifiedBadge.tsx` | Shareable public profile badge |
| `ATSScorePanel.tsx` | ATS evaluation results panel |

---

## 8. Deployment

### Local Development
```bash
python start_all.py   # verifies AuraDB config, then starts FastAPI + Next.js
```

The script checks `backend/.env` for a valid `NEO4J_URI` and warns if it still
points to localhost. DB health is accessible at `http://localhost:8000/api/health/db`.

### Docker (Production — Frontend + Backend only)
```bash
docker compose up -d   # backend + frontend (Neo4j is AuraDB, not containerised)
```

### Required Environment Variables
```env
# Neo4j AuraDB (cloud) — get from console.neo4j.io
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<username>       # note: USERNAME not USER
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=<database-name>

# Groq (required — powers all LLM calls via langchain_groq)
GROQ_API_KEY=your_groq_api_key_here

# GitHub Token (optional — avoids public API rate limits)
GITHUB_TOKEN=your_github_token_here

# Optional integrations
JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key   # Free tier enables /people/match fallback
```

> **Security:** `.env` and `Neo4j-*.txt` files are both excluded via `.gitignore`.
# PROJECT SPECIFICATION: TrueSkill AI (MSc Data Science Thesis)

## 1. Project Overview
**Title:** TrueSkill AI: Automated Competency Verification System  
**Type:** Master's Thesis Final Project  
**Core Value:** A multi-agent system that verifies claims on a PDF resume by cross-referencing them with actual code analysis from a GitHub repository using GraphRAG (Graph-based Retrieval Augmented Generation).

---

## 2. Technical Architecture

### 2.1 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Vanilla CSS |
| **3D Graph** | react-force-graph-3d, Three.js |
| **Charts** | Recharts |
| **Backend** | Python 3.9+, FastAPI, Pydantic v2 |
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
| **Coach Module** | `coach.py` | Gap analysis, bridge project generation, JD Skills Gap Heatmap, learning roadmap, conversational chat, HTML report export |
| **Job Finder** | `job_finder.py` | Jooble job search + Apollo.io hiring manager lookup |
| **Resume Optimizer** | `resume_optimizer.py` | LLM keyword rewriting + personalized email drafting |
| **Report Generator** | `report.py` | Self-contained HTML verification report |
| **Storage** | `storage.py` | SQLite CRUD for saving & comparing analyses |
| **Database** | `db.py` | Neo4j AuraDB driver + `query_graph()` helper; supports `NEO4J_USERNAME` / `NEO4J_DATABASE` |
| **Graph Explain** | `graph_explain.py` | 8-section AI architectural summary via Groq Llama 3.3 70B (tech stack, modules, hotspot, suggestions) |
| **Function Explain** | `function_explain.py` | Per-function AI explanation: purpose, complexity verdict, refactor suggestions |
| **LLM Client** | `llm.py` | Shared Groq Llama 3.3 70B client + JSON parser |
| **API** | `api.py` | 30+ FastAPI endpoints with rate limiting |

---

## 3. Data Models (Strict Schema)

### 3.1 Graph Database Schema (Neo4j)

**Nodes:**
```
(:File   { name, path, language, repo_id })
(:Class  { name, line_start, line_end, file_path, repo_id, bases[] })
(:Function { name, args[], complexity_score, line_start, line_end, file_path, repo_id, parent_class, calls[], source_code })
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

**Function node (Neo4j + in-memory):**
```python
class FunctionNode:
    name: str
    args: list[str]
    complexity_score: int
    line_start: int
    line_end: int
    file_path: str
    repo_id: str
    parent_class: str | None
    calls: list[str]
    source_code: str  # raw function body captured at parse time (capped 10KB)
                      # stored on Neo4j Function node for Code Drill-Down
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

**Coach — JD Skills Gap Heatmap:**
```python
class HeatmapRow(BaseModel):
    skill: str
    category: str           # "Language" | "Framework" | "Tool" | "Concept" | "Soft Skill"
    verified_score: int     # 0-100 from real code analysis (0 = not in profile)
    ats_found: bool         # whether keyword was found in resume text
    gap_severity: str       # "None" | "Minor" | "Moderate" | "Critical"
    recommendation: str     # 1-line actionable tip

class SkillsHeatmapResponse(BaseModel):
    rows: list[HeatmapRow]
    overall_match_pct: int
    critical_count: int
    moderate_count: int
```

**Coach — Learning Roadmap:**
```python
class RoadmapWeek(BaseModel):
    week: int
    focus_skill: str
    tasks: list[str]        # 3-4 concrete daily tasks
    milestone: str          # what you will have built by end of week
    hours_required: int

class RoadmapResponse(BaseModel):
    weeks: list[RoadmapWeek]
    total_weeks: int
    total_hours: int
    readiness_date: str
```

**Graph Explain request (sent to `/api/graph/explain`):**
```python
class GraphExplainRequest(BaseModel):
    repo_id: str
    node_count: int
    edge_count: int
    type_counts: dict[str, int]
    top_complex: list[dict]       # top 10 by complexity_score
    top_hubs: list[dict]          # top 10 by degree
    orphan_count: int
    file_list: list[str]          # up to 20 file names (for tech stack inference)
    edge_type_counts: dict[str, int]
    avg_complexity: float
    class_list: list[str]         # up to 10 class names
    import_list: list[str]        # up to 15 import names
    repo_names: list[str]
```

**Graph Summary response (8-section structured JSON):**
```python
{
    "summary": str,               # 3-4 sentence overview
    "architecture_style": str,    # e.g. "Modular Monolith"
    "tech_stack": list[str],      # inferred technologies
    "modules": [                  # logical module breakdown
        { "name": str, "role": str, "key_files": list[str] }
    ],
    "key_observations": list[str],     # 5 specific bullets
    "hotspot_analysis": str,           # highest-risk maintenance area
    "improvement_suggestions": list[str],  # 3 actionable recommendations
    "complexity_verdict": str,         # e.g. "High"
    "complexity_reasoning": str,
}
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

1. **Parser (Node A):** Resume text → `List[ResumeClaim]` via Groq Llama 3.3 70B
2. **Auditor (Node B):** Per claim → topic-synonym expansion → Cypher query → `GraphEvidence`
3. **Grader (Node C):** Evidence + LLM analysis → `VerificationResult` (0–100 score)

**Scoring formula:**
- +30 base if evidence nodes exist
- +5 per node (max +20)
- +20 if code complexity matches claimed difficulty level
- +30 from LLM reasoning quality assessment

**Topic synonym expansion** (`TOPIC_SYNONYMS` map) covers 15+ tech domains for broader graph matching.

**`claim_id` uniqueness:** Each claim is assigned an ID prefixed with the first 6 characters of `repo_id` (e.g. `abc123_0`). This prevents collisions when results from multiple repo analysis runs are merged by topic.

### Workflow 2: The ATS Pipeline
Standalone async call (no graph dependency):

1. **Input:** PDF resume + job description text
2. **LLM analysis:** Extracts keywords, scores sections (Summary, Experience, Skills, Education)
3. **Output:** `ATSReport` + downloadable HTML report

### Workflow 3: AI Resume Toolkit (4-Step)
Multi-step sequential workflow available at `/resume-toolkit`:

1. **Job Search** — PDF → LLM infers role + location → Jooble API → ranked job list
2. **ATS Optimization** — PDF + JD → keyword gap analysis → LLM rewrites Skills/Summary
3. **Hiring Manager Lookup** — Company name + title → Apollo.io `/people/search` (paid) → `/people/match` (free tier) → email pattern guess
4. **Email Drafting** — PDF + job posting + hiring manager → LLM-personalized cold email

### Workflow 4: Career Coaching Suite
The Career Coach section provides four integrated sub-workflows:

**4a. Bridge Project Generation** (`POST /api/coach`)
1. **Input:** `VerifiedSkills[]` + job description text + num_projects (1–5)
2. **Logic:** Identify gaps (score < 50) + missing JD keywords
3. **Output:** List of `BridgeProject` with title, tech stack, step-by-step instructions

**4b. JD Skills Gap Heatmap** (`POST /api/coach/heatmap`)
1. **Input:** verified_skills + job_description + optional ats_keyword_matches
2. **LLM extracts** all JD requirements and classifies each by category
3. **Triangulation:** JD requirement → code score (verified_score) → resume presence (ats_found)
4. **Output:** `SkillsHeatmapResponse` sorted Critical→Moderate→Minor→None
5. **ATS reuse:** if `ats_keyword_matches` provided (from prior ATS run), no extra LLM call for keyword extraction

**4c. Week-by-Week Roadmap** (`POST /api/coach/roadmap`)
1. **Input:** bridge_projects + gap_summary + hours_per_week
2. **LLM distributes** bridge project work realistically across weeks
3. **Output:** `RoadmapResponse` with concrete daily tasks and milestones per week

**4d. Conversational Coach Chat** (`POST /api/coach/chat`)
1. **Input:** user message + JSON context (bridge_projects, gap_summary, verified_skills, job_description)
2. **Tailored reply:** answers specific to the candidate's actual profile — no generic advice
3. **Output:** plain-text reply (≤150 words unless detail required)

**4e. Coach Report Export** (`POST /api/coach/export`)
- Returns a self-contained HTML file (no external dependencies)
- Sections: Header → Gap Summary → Heatmap table → Bridge Projects → Roadmap timeline

### Workflow 5: AI Graph Summary
Triggered by the ✨ **Explain** button in the 3D Graph toolbar:

1. **Client computes** structural metrics: file list, edge type counts, avg complexity, class/import lists, top hub nodes, top complex nodes
2. **POST `/api/graph/explain`** sends enriched context to Groq Llama 3.3 70B
3. **Structured 8-section JSON** returned and rendered as a collapsible glassmorphic panel

### Workflow 6: Function Explain
Triggered by clicking ✨ **Explain** in the NodeInfoPanel for any `Function` node:

1. **Client sends** function name, source code, complexity score, file path
2. **POST `/api/function/explain`** → Groq Llama 3.3 70B
3. Returns: purpose summary, complexity verdict, potential bugs, refactor suggestions

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

### AI Graph Intelligence
```
POST   /api/graph/explain              { GraphExplainRequest }  → GraphSummaryData (8-section JSON)
POST   /api/function/explain           { name, source_code, complexity_score, file_path } → FunctionExplanation
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

### Evidence Code Drill-Down
```
GET    /api/node-code/{repo_id}/{node_id}  → { source_code, name, file_path,
                                               line_start, line_end,
                                               complexity_score, args, parent_class }
       # node_id format matches evidence_node_ids: "path/file.py:function_name"
       # 404 detail=no_source_code → repo needs re-ingestion
       # 404 detail=node_not_found → node absent from graph
       # Supports forward-slashes via FastAPI :path parameter type
```

### Career Coach
```
POST   /api/coach                      { verified_skills, job_description, num_projects }
                                       → { gap_analysis_summary, bridge_projects[], bridge_project }

POST   /api/coach/heatmap              { verified_skills, job_description, ats_keyword_matches? }
                                       → SkillsHeatmapResponse { rows[], overall_match_pct, critical_count, moderate_count }

POST   /api/coach/roadmap              { bridge_projects, gap_summary, job_description, hours_per_week }
                                       → RoadmapResponse { weeks[], total_weeks, total_hours, readiness_date }

POST   /api/coach/chat                 { message, context }
                                       → { reply: str }

POST   /api/coach/export               { candidate_name, gap_summary, bridge_projects, heatmap?, roadmap? }
                                       → HTML file download (Content-Disposition: attachment)
```

### ATS Tools
```
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
| **Explainability** | ✅ Implemented | Every `VerificationResult` returns `evidence_node_ids`; SkillCard shows 👁 View Code + 📍 Show in Graph per evidence row; GraphVisualizer NodeInfoPanel exposes Code Drill-Down + Function Explain for Function nodes; AI Graph Summary explains overall architecture. |
| **Multi-language support** | ✅ Implemented | tree-sitter parsers for Python, JavaScript, TypeScript, Go, Java, Rust. |
| **Streaming results** | ✅ Implemented | `/api/analyze` returns SSE with live per-node progress then final JSON. |
| **Candidate comparison** | ✅ Implemented | SQLite persistence + `/compare` frontend page. |
| **ATS evaluation** | ✅ Implemented | `ats.py` — weighted keyword/content/format scoring + downloadable report. |
| **AI Architectural Insights** | ✅ Implemented | `graph_explain.py` — 8-section structured JSON via Groq; collapsible panel in 3D graph view. |
| **Career Coaching Suite** | ✅ Implemented | `coach.py` — JD Skills Gap Heatmap, week-by-week learning roadmap, conversational AI coach chat, and self-contained HTML export. |

---

## 7. Frontend Pages

| Route | Component | Description |
|---|---|---|
| `/` | `page.tsx` | Animated landing page with feature cards + tech stack footer |
| `/dashboard` | `dashboard/page.tsx` | Main workflow: upload PDF → select repo → run analysis → tabbed results (Skills / Radar / Activity / Graph) + Career Coach section |
| `/compare` | `compare/page.tsx` | Side-by-side multi-candidate comparison with gauge charts |
| `/resume-toolkit` | `resume-toolkit/page.tsx` | 4-step AI Resume Toolkit (Jobs → ATS → Manager → Email) |
| `/profile/[token]` | `profile/[id]/page.tsx` | Public shareable verified profile page (no auth required) |

### Dashboard Tabs
| Tab | Description |
|---|---|
| **Skills** | Sorted skill cards (Verified → Partial → Unverified). Filter toolbar: search by name, filter by status, Expand All / Collapse All. Each card shows animated score bar, parsed code evidence (file → function), 📍 Show in Graph button per row, AI reasoning, complexity analysis, and AI Interview Prep questions. |
| **Radar** | Skill radar chart comparing verified scores vs LLM-generated role benchmarks (via `POST /api/benchmarks/generate`). Shows gap analysis cards and summary pills. |
| **Activity** | Contribution heatmap + language skill timeline. |
| **Graph** | Interactive 3D force-graph of the Neo4j knowledge graph with AI Summary, Evidence Highlighting, Path Finder, and Analytics Panel. |

### Career Coach Section (below main tabs)
The Career Coach section is rendered below the main tab grid in the dashboard. It contains:
1. **Left panel** — Job description input, number of projects selector, Generate Action Plan button, Export Report button
2. **Right panel** — Bridge project carousel with tab per project (Gap skill, difficulty, tech stack, steps, learning outcomes)
3. **Below the grid (full width):**
   - **JD Skills Gap Heatmap** — `SkillsGapHeatmap.tsx` (Generate Heatmap button; reuses ATS data when available)
   - **Learning Roadmap** — `LearningRoadmap.tsx` (hours/week selector, Generate Roadmap, task checkboxes)
   - **Coach Chat** — `CoachChat.tsx` (suggested questions, message thread, sessionStorage persistence)

### Key Frontend Components
| Component | Description |
|---|---|
| `GraphVisualizer.tsx` | 3D force-graph (**react-force-graph-3d** + Three.js): Bloom post-processing, Neighborhood Focus Mode, **AI Graph Summary** (8-section collapsible panel), **Evidence Node Highlighting** (amber highlight for Show-in-Graph), **Function Explain** (per-node AI explanation), **Path Finder** (start→end dependency path), **Analytics Panel**, Code Drill-Down, Type/Complexity/Repo colour modes, search + type filters, first-load dimension fix |
| `SkillCard.tsx` | Per-claim card: animated score bar, parsed evidence nodes (file type badge + file→function), sectioned layout, hover **📍 Show in Graph** per evidence row, hover **👁 View Code** button, Interview Prep with collapsible hints + Copy All |
| `CodeViewer.tsx` | Code drill-down modal: inline syntax highlighter (zero npm deps), line numbers, metadata bar (Lines X–Y, CC badge, args), Copy Code, loading skeleton, graceful re-ingest / not-found states, ESC to close |
| `ErrorBoundary.tsx` | React error boundary wrapping graph and heavy async components; shows friendly fallback UI on crash |
| `SkillRadar.tsx` | Recharts radar: fetches LLM benchmarks on-demand so traces always align |
| `ATSScorePanel.tsx` | ATS evaluation results panel |
| `SkillsGapHeatmap.tsx` | Sortable JD Skills Gap Heatmap: severity badges, animated score bars, ATS reuse indicator, collapsible panel |
| `LearningRoadmap.tsx` | Horizontal scrollable week cards with task checkboxes (localStorage), progress bar, hours/week presets |
| `CoachChat.tsx` | Collapsible chat panel: suggested questions, user/AI bubbles, typing indicator, Enter-to-send |

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
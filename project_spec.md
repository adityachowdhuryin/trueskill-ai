# PROJECT SPECIFICATION: TrueSkill AI (MSc Data Science Thesis)

## 1. Project Overview
**Title:** TrueSkill AI: Automated Competency Verification System  
**Type:** Master's Thesis Final Project  
**Core Value:** A multi-agent system that verifies claims on a PDF resume by cross-referencing them with actual code analysis from a GitHub repository using GraphRAG (Graph-based Retrieval Augmented Generation). Includes a full career coaching suite powered by **Alex**, an intelligent AI career co-pilot.

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
| **Local Data Storage** | JSON flat-files (`backend/data/`) — session memory, feedback log |
| **HTTP Client** | httpx (async, for GitHub API / Jooble / Apollo.io) |
| **PDF Parser** | PyPDF2 |

### 2.2 System Modules

| Module | File | Description |
|---|---|---|
| **Ingestion Engine** | `ingest.py` | Clone repos, parse ASTs via tree-sitter, build Neo4j graph |
| **Reasoning Core** | `agents.py` | LangGraph Parser → Auditor → Grader pipeline |
| **Alias Map** | `alias_map.py` | 110+ library alias entries mapping marketing names to Python import names (PyTorch→torch, OpenCV→cv2, etc.) |
| **Forensics** | `forensics.py` | Stylometric authorship & AI-code detection |
| **ATS Scorer** | `ats.py` | Resume vs JD evaluation, HTML report generation |
| **Coach Module** | `coach.py` | Gap analysis, bridge project generation, JD Skills Gap Heatmap, learning roadmap, **streaming conversational coach chat with cross-session memory, live screen awareness, and agentic tool-calling**, HTML report export |
| **JD Fetcher** | `jd_fetcher.py` | Fetches and parses job descriptions from live URLs for automatic JD import |
| **Claim Challenger** | `challenge.py` | Adversarial LLM function — argues the opposite verdict for a skill claim (Devil's Advocate) |
| **Project Verifier** | `project_verifier.py` | Project verification pipeline: tech coverage scoring, architecture assessment, bullet verdict analysis, repo matching |
| **Project Features** | `project_features.py` | Project-scoped LLM features: interview question generation, project verdict challenge, bullet deep-dive explanations |
| **Job Finder** | `job_finder.py` | Jooble job search + Apollo.io hiring manager lookup |
| **Resume Optimizer** | `resume_optimizer.py` | LLM keyword rewriting + personalized email drafting |
| **Report Generator** | `report.py` | Self-contained HTML verification report |
| **Storage** | `storage.py` | SQLite CRUD for saving & comparing analyses |
| **Database** | `db.py` | Neo4j AuraDB driver + `query_graph()` helper |
| **Graph Explain** | `graph_explain.py` | 8-section AI architectural summary via Groq Llama 3.3 70B |
| **Function Explain** | `function_explain.py` | Per-function AI explanation: purpose, complexity verdict, refactor suggestions |
| **LLM Client** | `llm.py` | Shared Groq Llama 3.3 70B client + JSON parser; `_FallbackChatGroq` wrapper auto-retries with `GROQ_API_KEY_BACKUP` on 429 errors |
| **API** | `api.py` | 40+ FastAPI endpoints with rate limiting |

---

## 3. Data Models (Strict Schema)

### 3.1 Graph Database Schema (Neo4j)

**Nodes:**
```
(:File   { name, path, language, repo_id })
(:Class  { name, line_start, line_end, file_path, repo_id, bases[] })
(:Function { name, args[], complexity_score, line_start, line_end, file_path, repo_id, parent_class, calls[], source_code, docstring })
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
    topic: str                   # e.g. "Python", "Machine Learning"
    claim_text: str              # Exact claim from resume
    difficulty: int              # 1-5 expertise level
    claim_type: str              # "code_verifiable" | "not_code_verifiable"
    specific_libraries: list[str]
```

**Verification result (per claim):**
```python
class VerificationResult(BaseModel):
    claim_id: str
    topic: str
    claim_text: str
    status: str         # "Verified" | "Partially Verified" | "Unverified"
                        # | "Not Code-Verifiable" | "Repo Not Available"
    score: int          # 0-100
    evidence_node_ids: list[str]
    reasoning: str
    complexity_analysis: str
    score_breakdown: dict   # {evidence_base, node_bonus, complexity (depth_bonus), llm}
```

**Coach chat request (extended):**
```python
class CoachChatRequestModel(BaseModel):
    message: str
    context_data: dict
    history: list[dict]
    ats_report: Optional[dict]
    forensics: Optional[dict]
    project_results: Optional[list]
    graph_metadata: Optional[dict]
    current_tab: Optional[str]
    candidate_name: Optional[str]
    focused_on: Optional[dict]           # Live screen awareness: {type, label, data?}
    previous_session_notes: Optional[str] # Cross-session memory injected from memory store
```

**Memory store entry (`backend/data/memories.json`):**
```json
{
  "session_key": {
    "memory": "2-3 sentence LLM-generated session summary",
    "saved_at": "2026-05-17T07:00:00+00:00"
  }
}
```

**Feedback log (`backend/data/feedback.jsonl` — newline-delimited JSON):**
```json
{"session_key": "...", "message_content": "...", "reaction": "up|down", "timestamp": "..."}
```

**ATS evaluation:**
```python
class ATSReport(BaseModel):
    ats_score: int
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
    share_token TEXT
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
2. **Auditor (Node B) — 3-Layer Scoped Verification:**
   - Layer 1: Claim classification (not_code_verifiable bypass)
   - Layer 2: Repo routing via language/import profiling
   - Layer 3: Cypher query with LIBRARY_ALIAS_MAP (110+ entries) + docstring search

3. **Grader (Node C):** Evidence + LLM analysis → `VerificationResult` (0–100 score)

**Scoring formula (max 100):**
- **evidence_base:** +0 / +15 (imports only) / +30 (function or class nodes)
- **node_bonus:** +2 per node, capped at +10
- **depth_bonus:** 0–20 pts based on function count, import diversity, cyclomatic complexity
- **llm_score:** 0–40 from LLM semantic analysis (6 snippets × 2,000 chars)
- **Thresholds:** Verified ≥ 60 · Partially Verified ≥ 30 · Unverified < 30

### Workflow 2: The ATS Pipeline
Standalone async call: PDF resume + JD → `ATSReport` + HTML report

### Workflow 3: AI Resume Toolkit (4-Step)
Available at `/resume-toolkit`:
1. Job Search — PDF → Jooble API → ranked jobs
2. ATS Optimization — keyword gap + LLM rewrites
3. Hiring Manager Lookup — Apollo.io → email pattern
4. Email Drafting — LLM-personalized cold email

### Workflow 4: Career Coaching Suite

**4a. Bridge Project Generation** (`POST /api/coach`)
**4b. JD Skills Gap Heatmap** (`POST /api/coach/heatmap`)
**4c. Week-by-Week Roadmap** (`POST /api/coach/roadmap`)
**4d. Coach Report Export** (`POST /api/coach/export`)

**4e. Alex — Streaming AI Career Coach Chat** (`POST /api/coach/chat/stream`)

The flagship feature. Alex is a proactive, context-aware AI career co-pilot:

- **Streaming SSE** — tokens stream immediately; `<!-- -->` command blocks buffered and stripped only after stream completion via `final_text` in the `done` payload
- **Live Screen Awareness** — `focused_on` field carries the current dashboard tab/context so Alex knows what the user is looking at
- **Cross-Session Memory** — LLM-generated 2–3 sentence session summary persisted to `backend/data/memories.json` (30-day expiry); injected as `previous_session_notes` into every session
- **Agentic Action Calling** — Alex can trigger 5 career tool actions inline: Mock Interview, Resume Tailoring, Salary Intelligence, Application Kit, ATS Score Run
- **History Management** — `_truncate_history` caps conversation at 24k chars / 20 turns; always preserves the last 4 turns to prevent context-window crashes
- **Anti-hallucination** — constrained to only reference data present in the CANDIDATE SESSION DATA block
- **Protocol-driven UI** — uses `<!-- actions: [...] -->`, `<!-- suggestions: [...] -->`, and `<!-- action_prompt: {...} -->` comment blocks (invisible in streamed text) for frontend orchestration

**4f. Session Memory** (`POST /api/coach/memory/save`, `GET /api/coach/memory/{session_key}`)
- `POST`: Triggers `generate_session_memory` (LLM call) → saves to `memories.json`; prunes entries >30 days
- `GET`: Returns stored memory for a session key
- Frontend calls `GET` on mount (username known) and saves via `sendBeacon` on `beforeunload`

**4g. Feedback Logging** (`POST /api/coach/feedback`)
- Accepts `{session_key, message_content, reaction: "up"|"down"}` → appended to `feedback.jsonl`
- Triggered by 👍/👎 buttons that appear on hover over any Alex message

### Workflow 5: Mock Interview (`POST /api/mock-interview`)
Live AI interview session calibrated to verified skill gaps and a target JD.

### Workflow 6: Function Explain (`POST /api/function/explain`)
Per-function AI explanation triggered from the 3D graph NodeInfoPanel.

### Workflow 7: Verification Results Enhancement Suite
- **7a. Verification Summary Dashboard** — animated SVG donut chart + 4 stat cards
- **7b. Evidence Strength Meter** — 4-bar animated sub-score breakdown in each SkillCard
- **7c. AI Claim Challenger** — Devil's Advocate adversarial counter-argument
- **7d. Score Delta / Re-run History** — ↑/↓ delta badges, localStorage persistence

### Workflow 8: AI Graph Summary (`POST /api/graph/explain`)
8-section structured JSON response from Groq → collapsible panel in 3D graph view.

### Workflow 9: Project Verification Suite
Three-dimension scoring: Tech Coverage (40%) + Architecture Assessment (35%) + Claim Support (25%).

---

## 5. API Contract (FastAPI)

All endpoints registered under `/api` prefix with in-memory rate limiting (10 req/60s per client IP).

### Core Pipeline
```
POST   /api/ingest
POST   /api/extract-profile
POST   /api/analyze              → SSE stream
POST   /api/analyze/multi
GET    /api/graph/{repo_id}?limit=5000
GET    /api/skill-timeline/{repo_id}
GET    /api/forensics/{repo_id}
GET    /api/repos/ingested       → list of all ingested repos
```

### AI Graph Intelligence
```
POST   /api/graph/explain
POST   /api/function/explain
```

### Saved Analyses
```
POST   /api/analyses
GET    /api/analyses
GET    /api/analyses/{id}
GET    /api/compare?ids=id1,id2
POST   /api/analyses/{id}/share
GET    /api/profile/{token}
```

### Career Coach
```
POST   /api/coach
POST   /api/coach/heatmap
POST   /api/coach/roadmap
POST   /api/coach/chat/stream    → SSE stream (Alex — streaming coach chat)
POST   /api/coach/export
POST   /api/coach/memory/save    → generate + persist session memory (30-day expiry)
GET    /api/coach/memory/{key}   → retrieve session memory
POST   /api/coach/feedback       → log 👍/👎 reaction to feedback.jsonl
```

### JD Import
```
POST   /api/coach/fetch-jd       { url } → { job_description: str }
```

### Mock Interview
```
POST   /api/interview-questions
POST   /api/mock-interview
POST   /api/mock-interview/grade
```

### Resume & ATS
```
POST   /api/ats-score
POST   /api/ats-report
POST   /api/export-report
POST   /api/coach/tailor-resume
POST   /api/coach/salary-intelligence
POST   /api/coach/application-kit
POST   /api/coach/extract-resume-text
```

### Project Verification
```
POST   /api/analyze/projects
POST   /api/analyze/projects/single
POST   /api/projects/interview-questions
POST   /api/projects/challenge
POST   /api/projects/architecture-snapshot
POST   /api/projects/explain-missing-bullet
```

### Resume Toolkit
```
POST   /api/resume-toolkit/find-jobs
POST   /api/resume-toolkit/optimize-keywords
POST   /api/resume-toolkit/find-hiring-manager
POST   /api/resume-toolkit/draft-email
```

### Verification Enhancements
```
POST   /api/challenge-claim
GET    /api/node-code/{repo_id}/{node_id}
POST   /api/benchmarks/generate
```

### Health
```
GET    /health
GET    /api/health/db
```

---

## 6. Thesis-Specific Requirements (Implemented)

| Requirement | Status | Implementation |
|---|---|---|
| **Cyclomatic Complexity** | ✅ | `ingest.py` — full AST traversal |
| **Stylometry** | ✅ | `forensics.py` — Shannon entropy, git history analysis |
| **Explainability** | ✅ | `evidence_node_ids` + `score_breakdown`; Code Drill-Down; Function Explain; AI Graph Summary |
| **Multi-language support** | ✅ | tree-sitter: Python, JS, TS, Go, Java, Rust |
| **Streaming results** | ✅ | SSE for verification + coach chat |
| **Candidate comparison** | ✅ | SQLite + `/compare` page |
| **ATS evaluation** | ✅ | `ats.py` — weighted keyword/content/format scoring |
| **AI Architectural Insights** | ✅ | `graph_explain.py` — 8-section structured JSON |
| **Career Coaching Suite** | ✅ | Full suite + Alex AI career co-pilot |
| **Adversarial Verification** | ✅ | `challenge.py` — Devil's Advocate LLM |
| **Score Transparency** | ✅ | `score_breakdown` + animated 4-bar meter |
| **Progress Tracking** | ✅ | Score delta badges + localStorage history |
| **Cross-session Memory** | ✅ | `memories.json` + 30-day expiry + `sendBeacon` on unload |
| **Live Screen Awareness** | ✅ | `focused_on` field in chat request — Alex knows current tab/context |
| **Agentic Tool-Calling** | ✅ | Alex can trigger 5 career actions inline via `<!-- actions: -->` protocol |
| **Feedback Loop** | ✅ | 👍/👎 reactions logged to `feedback.jsonl` for future model improvement |

---

## 7. Frontend Pages

| Route | Component | Description |
|---|---|---|
| `/` | `page.tsx` | Animated landing page |
| `/dashboard` | `dashboard/page.tsx` | Main workflow: upload PDF → analysis → tabbed results + Career Coach section + Alex floating panel |
| `/compare` | `compare/page.tsx` | Side-by-side candidate comparison |
| `/resume-toolkit` | `resume-toolkit/page.tsx` | 4-step AI Resume Toolkit |
| `/profile/[token]` | `profile/[id]/page.tsx` | Public shareable verified profile |

### Dashboard Tabs
| Tab | Description |
|---|---|
| **Skills** | Sorted skill cards. Filter toolbar: search, status, Expand All. Each card shows score bar, evidence, Evidence Strength Meter, Interview Prep, Challenge button, delta badge. |
| **Radar** | Skill radar vs LLM role benchmarks. |
| **Activity** | Contribution heatmap + language skill timeline. |
| **Graph** | Interactive 3D force-graph with AI Summary, Evidence Highlighting, Path Finder, Analytics. |
| **Projects** | Project verification with 5 per-project AI features. |

### Key Frontend Components
| Component | Description |
|---|---|
| `TrueSkillAssistant.tsx` | **Alex AI career coach floating panel.** Expandable (400×560 / 680×740). Voice input (Web Speech API). 👍/👎 reactions on hover. 7-card Capability Welcome Screen on open. Smart rotating suggestion bank (5 categories × 5 chips). In-chat search (Ctrl+F). Export chat (.md). Clear conversation. Jump-to-bottom. Action Prompt Cards for agentic actions. Cross-session memory + live screen awareness wired to backend. |
| `MockInterview.tsx` | Live AI mock interview session UI |
| `TailoredResume.tsx` | Resume tailoring result panel |
| `SalaryIntelligenceCard.tsx` | Salary intelligence result card |
| `ApplicationKit.tsx` | Application kit (cover letter, LinkedIn, cold email) |
| `JdUrlInput.tsx` | URL-based JD import input |
| `MatchingJobsPanel.tsx` | Matching jobs panel from JD analysis |
| `GraphVisualizer.tsx` | 3D force-graph: Bloom, Neighborhood Focus, AI Summary, Evidence Highlighting, Function Explain, Path Finder, Analytics, Code Drill-Down |
| `SkillCard.tsx` | Per-claim card: score bar, delta badge, evidence, Evidence Strength Meter, Interview Prep, Challenge button |
| `VerificationSummaryBar.tsx` | Animated SVG donut chart + stat cards |
| `CodeViewer.tsx` | Source code modal with inline syntax highlighting |
| `ATSScorePanel.tsx` | ATS evaluation results |
| `ProjectCard.tsx` | Per-project card: tech coverage, arch score, bullet verdicts + 5 AI features |

---

## 8. Deployment

### Local Development
```bash
python start_all.py
```
Verifies AuraDB config, creates virtualenv, starts FastAPI + Next.js.

### Docker (Production)
```bash
docker compose up -d
```

### Data Directories
```
backend/data/
├── memories.json      # Cross-session Alex memory (30-day expiry per key)
└── feedback.jsonl     # 👍/👎 reaction log (newline-delimited JSON)
```

### Required Environment Variables
```env
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<username>
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=<database-name>

GROQ_API_KEY=your_groq_api_key_here
GROQ_API_KEY_BACKUP=your_backup_key_here

GITHUB_TOKEN=your_github_token_here

JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key
```

> **Security:** `.env` and `Neo4j-*.txt` files are excluded via `.gitignore`.
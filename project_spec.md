# PROJECT SPECIFICATION: TrueSkill AI (MSc Data Science Thesis)

## 1. Project Overview
**Title:** TrueSkill AI: Automated Competency Verification System
**Type:** Master's Thesis Final Project
**Core Value:** A multi-agent system that verifies claims on a PDF resume by cross-referencing them with actual code analysis from a GitHub repository using GraphRAG. Includes **Alex** — a full-featured AI career co-pilot.

---

## 2. Technical Architecture

### 2.1 Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Vanilla CSS |
| 3D Graph | react-force-graph-3d, Three.js |
| Charts | Recharts |
| Backend | Python 3.9+, FastAPI, Pydantic v2 |
| AI Orchestration | LangChain, LangGraph |
| LLM | Groq — Llama 3.3 70B (`langchain_groq`) |
| AST Parsing | tree-sitter (Python, JS, TS, Go, Java, Rust) |
| Graph Database | Neo4j AuraDB (cloud) — `neo4j+s://` |
| Relational Storage | SQLite (`trueskill_analyses.db`) |
| Local Data | JSON flat-files (`backend/data/`) |
| HTTP Client | httpx (async) |
| PDF Parser | PyPDF2 |

### 2.2 Backend Modules
| Module | File | Description |
|---|---|---|
| Ingestion Engine | `ingest.py` | Clone repos, parse ASTs, build Neo4j graph |
| Reasoning Core | `agents.py` | LangGraph Parser → Auditor → Grader |
| Alias Map | `alias_map.py` | 110+ library alias entries (PyTorch→torch, OpenCV→cv2, etc.) |
| Forensics | `forensics.py` | Stylometric authorship + AI-code detection |
| ATS Scorer | `ats.py` | Resume vs JD evaluation, HTML report |
| Coach Module | `coach.py` | Alex streaming chat, cross-session memory, agentic actions, bridge projects, heatmap, roadmap, mock interview, resume tailoring, salary intel, application kit |
| JD Fetcher | `jd_fetcher.py` | Fetch + parse live JD from URL |
| Claim Challenger | `challenge.py` | Devil's Advocate adversarial LLM |
| Project Verifier | `project_verifier.py` | Tech coverage, architecture assessment, bullet verdicts |
| Project Features | `project_features.py` | Per-project: interview questions, challenge, bullet explain |
| Job Finder | `job_finder.py` | Jooble job search + Apollo.io hiring manager |
| Resume Optimizer | `resume_optimizer.py` | LLM keyword rewriting + email drafting |
| Report Generator | `report.py` | Self-contained HTML verification report |
| Storage | `storage.py` | SQLite CRUD + share tokens |
| Database | `db.py` | Neo4j AuraDB driver + query helpers |
| Graph Explain | `graph_explain.py` | 8-section AI architectural summary (Groq) |
| Function Explain | `function_explain.py` | Per-function AI explanation |
| LLM Client | `llm.py` | Shared Groq Llama 3.3 70B + `_FallbackChatGroq` (auto-retry backup key on 429) |
| API | `api.py` | 50+ FastAPI endpoints with rate limiting |

---

## 3. Data Models

### 3.1 Neo4j Graph Schema
```
(:File   { name, path, language, repo_id })
(:Class  { name, line_start, line_end, file_path, repo_id, bases[] })
(:Function { name, args[], complexity_score, line_start, line_end, file_path,
             repo_id, parent_class, calls[], source_code, docstring })
(:Import { module_name, file_path, repo_id })

Relationships:
(:Function)-[:CALLS]->(:Function)
(:Class)-[:INHERITS_FROM]->(:Class)
(:File)-[:CONTAINS]->(:Class|:Function)
(:File)-[:IMPORTS]->(:Import)
```

### 3.2 Key Pydantic Models
```python
class ResumeClaim(BaseModel):
    topic: str; claim_text: str; difficulty: int
    claim_type: str      # "code_verifiable" | "not_code_verifiable"
    specific_libraries: list[str]

class VerificationResult(BaseModel):
    claim_id: str; topic: str; claim_text: str
    status: str          # "Verified"|"Partially Verified"|"Unverified"
                         # |"Not Code-Verifiable"|"Repo Not Available"
    score: int           # 0-100
    evidence_node_ids: list[str]
    reasoning: str; complexity_analysis: str
    score_breakdown: dict  # {evidence_base, node_bonus, complexity, llm}

class CoachChatRequestModel(BaseModel):
    message: str; context_data: dict; history: list[dict]
    ats_report: Optional[dict]; forensics: Optional[dict]
    project_results: Optional[list]; graph_metadata: Optional[dict]
    current_tab: Optional[str]; candidate_name: Optional[str]
    focused_on: Optional[dict]            # live screen awareness
    previous_session_notes: Optional[str] # cross-session memory

class ProjectVerificationResult(BaseModel):
    project_id: str; name: str; tech_stack: list[str]
    status: str; overall_score: int; matched_repo_id: str
    tech_coverage_score: int   # 40% weight
    architecture_score: int    # 35% weight
    claim_support_score: int   # 25% weight
    bullet_verdicts: list[BulletVerdict]
    all_evidence_node_ids: list[str]

class ATSReport(BaseModel):
    ats_score: int               # weighted: kw*0.45 + content*0.35 + format*0.20
    keyword_match_score: int; format_score: int; content_score: int
    keyword_matches: list; section_feedback: list
    top_missing_keywords: list[str]; strengths: list[str]; improvements: list[str]
```

### 3.3 Local Data Files
```
backend/data/memories.json   # {"session_key": {"memory": str, "saved_at": ISO}}
backend/data/feedback.jsonl  # {"session_key", "message_content", "reaction": "up|down", "timestamp"}
```

### 3.4 SQLite Schema
```sql
CREATE TABLE analyses (
    id TEXT PRIMARY KEY, candidate_name TEXT,
    repo_names TEXT, repo_ids TEXT,   -- JSON arrays
    results_json TEXT, skills_json TEXT,
    overall_score REAL, created_at TEXT,
    is_public INTEGER DEFAULT 0,
    share_token TEXT
);
```

---

## 4. Agent Workflows

### Workflow 1: Resume Verification (LangGraph SSE)
```
START → Parser → Auditor → Grader → END
```
**Parser:** Resume PDF → `List[ResumeClaim]` via LLM. Deduplicates by topic (highest difficulty kept). Hard cap: 20 claims.

**Auditor — 3-Layer Scoped Search:**
- Layer 1: `not_code_verifiable` claims (Agile, leadership, etc.) → bypass graph
- Layer 2: Repo routing via language/import profiling; falls back to all repos
- Layer 3: Cypher searches `n.name`, `n.module_name`, `n.source_code` (8k chars), `n.docstring`, `n.file_path`. Keywords expanded via `LIBRARY_ALIAS_MAP` + `specific_libraries`. Returns up to 100 nodes re-ranked: complex functions first.

**Grader — Scoring (max 100):**
- `evidence_base`: 0 / +15 (imports only) / +30 (function/class nodes)
- `node_bonus`: +2 per node, max +10
- `depth_bonus`: 0–20 (fn count ≥5: +10, ≥2: +5 · import diversity ≥3: +5, ≥1: +2 · complexity max≥5 or avg≥3: +5)
- `llm_score`: 0–40 (6 snippets × 2k chars, calibrated rubric)
- Thresholds: Verified ≥60 · Partially Verified ≥30 · Unverified <30

### Workflow 2: ATS Pipeline
PDF resume + JD → `ATSReport` + downloadable HTML report.

### Workflow 3: AI Resume Toolkit
4-step at `/resume-toolkit`: Job Search → ATS Optimization → Hiring Manager Lookup → Email Drafting.

### Workflow 4: Career Coaching Suite
- **4a Bridge Projects** — N projects targeting skill gaps (score <50 + missing JD keywords)
- **4b JD Skills Gap Heatmap** — triangulates JD requirements vs code score vs ATS resume presence
- **4c Learning Roadmap** — LLM distributes projects across realistic weekly schedule
- **4d Coach Report Export** — self-contained HTML

### Workflow 4e: Alex — Streaming AI Career Coach (`POST /api/coach/chat/stream`)
Alex is the flagship AI career co-pilot. Full specification:

**Streaming:** Tokens stream via SSE immediately. `<!-- actions: -->`, `<!-- suggestions: -->`, `<!-- action_prompt: -->` comment blocks are buffered and delivered only in the `done` payload as parsed fields (`actions`, `suggestions`, `action_prompt`, `final_text`). The raw `final_text` has all `<!-- -->` blocks stripped.

**Capability Welcome Screen:** When Alex is opened with no prior user messages, it displays 7 interactive capability cards:
1. 🔬 Skills Analysis — "Analyze my Python score"
2. 📄 ATS Audit — "What's hurting my ATS score?"
3. 🎙 Mock Interview — "Start my mock interview"
4. ✏️ Resume Tailoring — "Tailor my resume for this role"
5. 💰 Salary Intelligence — "What salary should I ask for?"
6. 📦 Application Kit — "Write my cover letter"
7. 🗺️ Career Roadmap — "Show my learning roadmap"

Cards 1 and 7 require data (`requiresData: true`) and show a "Run analysis first" grey badge when no analysis has been run. Clicking an example question fires it directly into chat and dismisses the welcome screen.

**⚡ Capabilities Button:** Always visible in the Alex header. During an active conversation, clicking it opens the capability cards as a full slide-over overlay above the chat. The overlay has a `×` close button; clicking a card example fires the message and auto-closes.

**Rotating Suggestion Bank:** 5 categories × 5 chips:
- Round 0: Career Coach (mock interview, salary, cover letter, cold email, application kit)
- Round 1: Skills & Graph (biggest gap, knowledge graph, highest-confidence skill, etc.)
- Round 2: ATS & Resume (ATS score hurt, missing keywords, resume rewrite, etc.)
- Round 3: Projects (bullet verified, what to build next, architecture snapshot, etc.)
- Round 4: Strategy (career risk, roadmap, job market, job title target, etc.)
Chips rotate after each completed assistant exchange (`suggestionRound = completed assistant messages`). LLM suggestions take priority when available, but the bank is always used until the user sends their first real message (auto-insight messages don't count).

**Proactive Auto-Insight:** Fires once after first analysis completes. Opens Alex and delivers a data-specific insight message automatically. Does NOT suppress the welcome screen — welcome screen remains visible alongside the auto-insight message until user sends their first intentional message.

**Live Screen Awareness:** `focused_on: {type, label, data?}` tracks the current dashboard tab and sends it with every chat request. Alex knows what the user is looking at.

**Cross-Session Memory:**
- On mount: `GET /api/coach/memory/{candidateName}` → `previous_session_notes` injected into system prompt
- On page unload: `navigator.sendBeacon(POST /api/coach/memory/save)` → LLM generates 2–3 sentence session summary → stored in `memories.json` with timestamp
- Entries older than 30 days are pruned automatically

**Agentic Tool-Calling:** Alex emits `<!-- actions: [{type}] -->` and `<!-- action_prompt: {...} -->` to trigger 5 career workflows:
- `startMockInterview` — opens `MockInterview.tsx`
- `tailorResume` — opens `TailoredResume.tsx`
- `showSalary` — opens `SalaryIntelligenceCard.tsx`
- `generateApplicationKit` — opens `ApplicationKit.tsx`
- `runAtsScore` — triggers ATS evaluation

**History Management:** `_truncate_history()` caps at 24k chars / 20 turns, always preserving last 4 turns.

**SYSTEM_PROMPT_COACH Rules:**
- PRECISION RULE: Every response must include at least one specific number/percentage from session data
- ANTI-HALLUCINATION: Only reference data present in CANDIDATE SESSION DATA block
- TONE CALIBRATION: Open with empathy when frustration signals detected
- FIRST MESSAGE RULE: On vague openers ("hi", "help", "what can you do?"), respond with capability overview
- Navigation actions: `switchTab`, `highlightNodes` — confirmed in text
- Output always ends with `<!-- suggestions: [...] -->` (≤8 words each)

**UX Features:**
- Voice input: Web Speech API, mic button, pulse animation, auto-hides in unsupported browsers
- 👍/👎 reactions on hover → `POST /api/coach/feedback` → `feedback.jsonl`
- Expand toggle: 400×560 (normal) ↔ 680×740 (expanded) with smooth transition
- In-chat search: `Ctrl+F` toggles, highlights matching messages
- Export chat: downloads `.md` file
- Clear conversation: with confirmation dialog
- Jump-to-bottom button: appears when scrolled up >60px

### Workflow 5: Mock Interview
`POST /api/coach/mock-interview/questions` → questions calibrated to skill gaps + JD.
`POST /api/coach/mock-interview/grade` → per-answer grade with feedback.
Rendered in `MockInterview.tsx`.

### Workflow 6: Function Explain (`POST /api/explain-function`)
Click any `Function` node in 3D graph → NodeInfoPanel → ✨ Explain → AI purpose, complexity verdict, refactor suggestions.

### Workflow 7: Verification Results Enhancements
- **7a Verification Summary Dashboard** (`VerificationSummaryBar.tsx`): animated SVG donut chart (per-segment glow), 4 stat cards with click-to-filter, avg score in centre
- **7b Evidence Strength Meter**: 4-bar animated breakdown (evidence_base/node_bonus/depth_bonus/llm) inside each SkillCard
- **7c AI Claim Challenger** (`POST /api/challenge-claim`): Devil's Advocate ≤180-word counter-argument; hidden for 0-score/no-evidence cards
- **7d Score Delta**: ↑/↓ badges vs previous run, localStorage persistence

### Workflow 8: AI Graph Summary (`POST /api/graph/explain`)
8-section JSON via Groq: summary, architecture_style, tech_stack, modules, key_observations, hotspot_analysis, improvement_suggestions, complexity_verdict. Rendered as collapsible panel in 3D graph view.

### Workflow 9: Project Verification Suite
- **Tech Coverage (40%):** alias-aware Cypher search for each claimed technology
- **Architecture Assessment (35%):** LLM receives top 5 complex functions × 1.5k chars source code
- **Claim Support (25%):** per-bullet verdict with evidence citations
- **5 per-card AI features:** View Code, Architecture Snapshot, Interview Prep, Devil's Advocate, Bullet Deep-Dive

---

## 5. Complete API Reference

### Core Pipeline
```
POST /api/ingest                       { github_url } → IngestResponse
POST /api/extract-profile              { pdf_file } → ExtractProfileResponse
POST /api/analyze                      { pdf_file, repo_id } → SSE stream
POST /api/analyze/multi                { pdf_file, repo_ids[] } → merged JSON
GET  /api/graph/{repo_id}?limit=5000   → GraphResponse (nodes, edges, meta)
POST /api/graph/path                   { start_id, end_id, repo_id } → path nodes
GET  /api/skill-timeline/{repo_id}     → timeline by language
GET  /api/forensics/{repo_id}          → authorship + stylometry
GET  /api/heatmap/{repo_id}            → GitHub-style contribution heatmap
GET  /api/repos/ingested               → list of all ingested repos
```

### AI Intelligence
```
POST /api/graph/explain                { GraphExplainRequest } → 8-section JSON
POST /api/explain-function             { name, source_code, complexity_score, file_path }
GET  /api/node-code/{repo_id}/{node_id} → source_code, metadata
```

### Saved Analyses
```
POST /api/analyses                     save analysis
GET  /api/analyses                     list analyses
GET  /api/analyses/{id}                get analysis
GET  /api/compare?ids=id1,id2          compare analyses
POST /api/analyses/{id}/share          → { share_token, profile_url }
GET  /api/profile/{token}              public profile (no auth)
```

### Alex / Career Coach
```
POST /api/coach                        { verified_skills, job_description, num_projects }
POST /api/coach/heatmap                { verified_skills, job_description, ats_keyword_matches? }
POST /api/coach/roadmap                { bridge_projects, gap_summary, hours_per_week }
POST /api/coach/chat/stream            { message, context_data, history, ...extended } → SSE
POST /api/coach/insights               { context_data } → { insight: str }
POST /api/coach/export                 → HTML download
POST /api/coach/memory/save            { session_key, messages } → generate + store summary
GET  /api/coach/memory/{key}           → { memory: str, saved_at: str }
POST /api/coach/feedback               { session_key, message_content, reaction }
POST /api/coach/fetch-jd               { url } → { job_description: str }
POST /api/coach/tailor-resume          { resume_text, job_description }
POST /api/coach/salary-intelligence    { job_description, candidate_context }
POST /api/coach/application-kit        { resume_text, job_description, hiring_manager? }
POST /api/coach/mock-interview/questions { verified_skills, job_description }
POST /api/coach/mock-interview/grade   { question, answer, skill_context }
POST /api/extract-resume-text          { pdf_file } → { text: str }
```

### Project Verification
```
POST /api/analyze/projects             { pdf_file, repo_ids[] }
POST /api/analyze/projects/single      { project_id, project_name, tech_stack, bullet_claims, repo_id }
POST /api/projects/interview-questions { project_name, tech_stack, bullet_claims, ... }
POST /api/projects/challenge           { project_name, ..., bullet_verdicts }
POST /api/projects/architecture-snapshot { matched_repo_id, matched_repo_name }
POST /api/projects/explain-missing-bullet { project_name, bullet_claim, missing_evidence_hint }
```

### Benchmarks, Interview, ATS
```
POST /api/benchmarks/generate          { role_description, skill_topics[] }
GET  /api/benchmarks                   list cached benchmarks
GET  /api/benchmarks/{role_slug}       get benchmark
POST /api/interview-questions          { topic, claim_text, difficulty, num_questions }
POST /api/challenge-claim              { topic, claim_text, score, status, score_breakdown? }
POST /api/ats-score                    { pdf_file, job_description } → ATSReport
POST /api/ats-report                   { ats_report, candidate_name } → HTML
POST /api/export-report                { ...results } → HTML
```

### Resume Toolkit & Jobs
```
POST /api/resume-toolkit/find-jobs             { pdf_file, location_override? }
POST /api/resume-toolkit/optimize-keywords     { pdf_file, job_description, missing_keywords }
POST /api/resume-toolkit/find-hiring-manager   { company_name, job_title, company_domain? }
POST /api/resume-toolkit/draft-email           { pdf_file, job_posting, hiring_manager }
POST /api/job-finder/search                    { query, location? } → jobs (no PDF required)
```

### Health
```
GET /health
GET /api/health/db
```

---

## 6. Frontend Pages & Components

### Pages
| Route | Description |
|---|---|
| `/` | Animated landing page with feature cards + tech stack |
| `/dashboard` | Main workflow: upload PDF → ingest repo → analyze → tabbed results + Alex |
| `/compare` | Side-by-side multi-candidate comparison with gauge charts |
| `/resume-toolkit` | 4-step AI Resume Toolkit |
| `/profile/[token]` | Public shareable verified profile (no auth) |

### Dashboard Tabs
| Tab | Description |
|---|---|
| **Skills** | Sorted skill cards (Verified→Partial→Unverified). Filter: search, status, Expand All. VerificationSummaryBar above. Each card: animated score bar, delta badge, evidence nodes, Evidence Strength Meter, Interview Prep, Challenge button. |
| **Radar** | Recharts radar vs LLM role benchmarks. |
| **Activity** | ContributionHeatmap + SkillTimeline. |
| **Graph** | 3D force-graph: Bloom, Neighborhood Focus, AI Summary, Evidence Highlighting, Path Finder, Analytics, Code Drill-Down, Function Explain. |
| **Projects** | ProjectSummaryBar + ProjectCard grid. Each card: tech coverage bars, bullet verdicts, 5 AI features. |

### Key Components
| Component | Description |
|---|---|
| `TrueSkillAssistant.tsx` | Alex floating AI career co-pilot. Full feature set: capability welcome screen, ⚡ Capabilities persistent toggle, rotating suggestion bank, streaming chat, proactive auto-insight, voice input, reactions, expand toggle, search, export, clear |
| `MockInterview.tsx` | Live AI mock interview session |
| `TailoredResume.tsx` | Resume tailoring result panel |
| `SalaryIntelligenceCard.tsx` | Salary range + negotiation points |
| `ApplicationKit.tsx` | Cover letter, LinkedIn message, cold email |
| `JdUrlInput.tsx` | URL-based JD import |
| `MatchingJobsPanel.tsx` | Job matches from JD analysis |
| `GraphVisualizer.tsx` | 3D force-graph: Bloom, fog, hover focus, AI Summary, evidence highlight, Function Explain, Path Finder, Analytics, Code Drill-Down |
| `SkillCard.tsx` | Score bar, delta badge, evidence nodes, Evidence Strength Meter, Interview Prep, Challenge button |
| `VerificationSummaryBar.tsx` | Animated SVG donut chart + 4 stat cards with click-to-filter |
| `ProjectCard.tsx` | Tech coverage bars, bullet verdicts, 5 per-project AI features |
| `CodeViewer.tsx` | Source code modal, inline syntax highlighting, ESC to close |
| `SkillsGapHeatmap.tsx` | Sortable heatmap: JD req vs code score vs ATS presence |
| `LearningRoadmap.tsx` | Scrollable week cards with checkbox persistence (localStorage) |
| `CoachChat.tsx` | Original embedded coach chat panel (still active in dashboard) |

---

## 7. Thesis Requirements Matrix

| Requirement | Status | Implementation |
|---|---|---|
| Cyclomatic Complexity | ✅ | `ingest.py` full AST traversal |
| Stylometry | ✅ | `forensics.py` Shannon entropy + git history |
| Explainability | ✅ | `score_breakdown`, Code Drill-Down, Function Explain, AI Graph Summary, Evidence Strength Meter |
| Multi-language | ✅ | tree-sitter: Python, JS, TS, Go, Java, Rust |
| Streaming | ✅ | SSE for verification + Alex chat |
| Candidate Comparison | ✅ | SQLite + `/compare` page |
| ATS Evaluation | ✅ | `ats.py` weighted scoring |
| AI Architectural Insights | ✅ | `graph_explain.py` 8-section JSON |
| Career Coaching Suite | ✅ | Full suite + Alex AI co-pilot |
| Adversarial Verification | ✅ | `challenge.py` Devil's Advocate |
| Score Transparency | ✅ | `score_breakdown` + 4-bar animated meter |
| Progress Tracking | ✅ | Score delta badges + localStorage history |
| Cross-Session Memory | ✅ | `memories.json` + 30-day expiry + sendBeacon |
| Live Screen Awareness | ✅ | `focused_on` field in every chat request |
| Agentic Tool-Calling | ✅ | Alex triggers 5 career workflows via `<!-- actions: -->` protocol |
| Feedback Loop | ✅ | 👍/👎 logged to `feedback.jsonl` |
| Capability Discovery | ✅ | Welcome screen + ⚡ Capabilities persistent toggle |
| Proactive Insights | ✅ | Auto-insight fires after first analysis; doesn't suppress welcome screen |

---

## 8. Deployment

### Local Development
```bash
python start_all.py   # one command starts everything
```

### Docker (Production)
```bash
docker compose up -d   # Neo4j is AuraDB, not containerised
```

### Data Directories
```
backend/data/
├── memories.json      # Cross-session Alex memory (30-day expiry per user key)
└── feedback.jsonl     # Reaction log (newline-delimited JSON)
```
Both excluded from git via `.gitignore`.

### Required Environment Variables
```env
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<username>
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=<database-name>
GROQ_API_KEY=your_key
GROQ_API_KEY_BACKUP=your_backup_key   # auto-used on 429 errors
GITHUB_TOKEN=your_token               # optional
JOOBLE_API_KEY=your_key               # optional
APOLLO_API_KEY=your_key               # optional (free tier: /people/match fallback)
```

> **Security:** `.env` and `Neo4j-*.txt` are excluded via `.gitignore`.
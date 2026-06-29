# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

A multi-agent system that cross-references PDF resume claims against actual GitHub repository code analysis using cyclomatic complexity scoring, coding stylometry, and a **Neo4j AuraDB** knowledge graph. Includes **Alex** — a proactive AI career co-pilot with streaming chat, cross-session memory, live screen awareness, agentic tool-calling, and persistent capability discovery.

---

## Project Structure

```
trueskill-ai/
├── backend/
│   ├── app/
│   │   ├── api.py                   # All API routes (50+ endpoints)
│   │   ├── agents.py                # LangGraph: Parser → Auditor → Grader
│   │   ├── alias_map.py             # 110+ library alias mappings (PyTorch→torch, etc.)
│   │   ├── ingest.py                # GitHub repo clone + AST parsing (6 languages)
│   │   ├── forensics.py             # Stylometric authorship analysis
│   │   ├── ats.py                   # ATS resume scoring + HTML report
│   │   ├── benchmarks.py            # LLM role skill benchmarks
│   │   ├── interview.py             # AI interview question generator
│   │   ├── coach.py                 # Alex AI coach: streaming chat, memory, agentic actions,
│   │   │                            #   bridge projects, heatmap, roadmap, mock interview,
│   │   │                            #   resume tailoring, salary intel, application kit
│   │   ├── jd_fetcher.py            # Fetch + parse live JD from URL
│   │   ├── challenge.py             # Devil's Advocate adversarial LLM
│   │   ├── project_verifier.py      # Project verification (tech coverage, arch, bullet verdicts)
│   │   ├── project_features.py      # Per-project AI features (interview, challenge, bullet explain)
│   │   ├── project_deep_dive.py     # 5-tab Project Deep Dive: scorecard, summary, tech-debt,
│   │   │                            #   skill signals, recruiter pitch
│   │   ├── job_finder.py            # Jooble job search + Apollo.io hiring manager lookup
│   │   ├── resume_optimizer.py      # LLM keyword rewriting + email drafting
│   │   ├── report.py                # HTML verification report generator
│   │   ├── storage.py               # SQLite: analyses + share tokens
│   │   ├── db.py                    # Neo4j AuraDB driver + query helpers
│   │   ├── graph_explain.py         # 8-section AI architectural summary (Groq)
│   │   ├── function_explain.py      # Per-function AI explanation
│   │   └── llm.py                   # Shared Groq Llama 3.3 70B client + backup key rotation
│   ├── data/                        # Local data (git-ignored)
│   │   ├── memories.json            # Alex cross-session memory (30-day expiry)
│   │   └── feedback.jsonl           # 👍/👎 reaction log
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Landing page
│       │   ├── dashboard/           # Main dashboard
│       │   ├── compare/             # Candidate comparison
│       │   ├── resume-toolkit/      # 4-step AI Resume Toolkit
│       │   └── profile/[id]/        # Public shareable profile
│       └── components/
│           ├── TrueSkillAssistant.tsx   # Alex floating AI career co-pilot panel
│           ├── MockInterview.tsx        # Live AI mock interview
│           ├── TailoredResume.tsx       # Resume tailoring result
│           ├── SalaryIntelligenceCard.tsx
│           ├── ApplicationKit.tsx       # Cover letter + LinkedIn + cold email
│           ├── JdUrlInput.tsx           # JD URL import
│           ├── MatchingJobsPanel.tsx    # Job matches from JD
│           ├── GraphVisualizer.tsx      # 3D force-graph
│           ├── GraphFullscreenModal.tsx
│           ├── ErrorBoundary.tsx
│           ├── ATSScorePanel.tsx
│           ├── SkillCard.tsx
│           ├── ProjectCard.tsx
│           ├── ProjectDeepDive.tsx      # 5-tab AI deep-dive per project card
│           ├── ProjectSummaryBar.tsx
│           ├── CodeViewer.tsx
│           ├── SkillRadar.tsx
│           ├── ContributionHeatmap.tsx
│           ├── VerifiedBadge.tsx
│           ├── ResumeOptimizer.tsx
│           ├── EmailComposer.tsx
│           ├── JobCard.tsx
│           ├── SkillTimeline.tsx
│           ├── Navbar.tsx
│           ├── Skeletons.tsx
│           ├── AnimatedCounter.tsx
│           ├── SkillsGapHeatmap.tsx
│           ├── LearningRoadmap.tsx
│           ├── CoachChat.tsx
│           └── VerificationSummaryBar.tsx
├── start_all.py
├── project_spec.md
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 20+, Python 3.9+
- Neo4j AuraDB free instance — [console.neo4j.io](https://console.neo4j.io)

### One-Command Launch
```bash
python start_all.py
```
Verifies AuraDB config → creates virtualenv → installs deps → starts FastAPI `:8000` + Next.js `:3000`.

### Manual Launch
```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| DB Health | http://localhost:8000/api/health/db |

---

## Features

### Alex — AI Career Co-Pilot
Floating panel (bottom-right FAB, `⌘K` shortcut) embedded in the dashboard:

**Discovery**
- **Capability Welcome Screen** — 7 interactive cards on first open (Skills Analysis, ATS Audit, Mock Interview, Resume Tailoring, Salary Intel, Application Kit, Career Roadmap). Cards are context-aware: locked with "Run analysis first" badge when no data is loaded. Each card has a clickable example question that fires directly into chat.
- **⚡ Capabilities button** — always visible in the header; re-opens the capability cards as a slide-over overlay at any point during a conversation. Clicking a card fires the message and auto-closes the overlay.
- **Rotating suggestion bank** — 5 categories × 5 chips (Career Coach, Skills & Graph, ATS & Resume, Projects, Strategy) rotating through categories after each exchange. LLM-generated suggestions take priority when available; bank is always used until the user sends their first real message.

**Chat**
- **Streaming SSE** — tokens stream immediately; `<!-- -->` command blocks stripped from final reply
- **Proactive auto-insight** — fires automatically after first analysis; opens Alex and delivers a data-specific insight without suppressing the welcome screen
- **Live screen awareness** — `focused_on` field tracks the current dashboard tab
- **Cross-session memory** — LLM-generated session summary (30-day expiry) loaded on mount via `GET /api/coach/memory/{key}`, saved via `sendBeacon` on page unload
- **Agentic tool-calling** — Alex triggers 5 workflows inline: Mock Interview, Resume Tailoring, Salary Intelligence, Application Kit, ATS Score Run (rendered as Action Prompt Cards)
- **History management** — capped at 24k chars / 20 turns; always preserves last 4 turns

**UX**
- Voice input (Web Speech API, pulse animation, auto-hides in unsupported browsers)
- 👍/👎 reactions on hover → logged to `feedback.jsonl`
- Expand toggle: 400×560 ↔ 680×740 with smooth transition
- In-chat search (`Ctrl+F`) with message highlighting
- Export conversation as `.md`
- Clear conversation with confirmation dialog
- Jump-to-bottom button when scrolled up

### Verification Pipeline (LangGraph)
Three-agent SSE-streaming workflow:
1. **Parser** — Extracts `ResumeClaim` list (topic, claim_text, difficulty, claim_type, specific_libraries). Classifies `code_verifiable` vs `not_code_verifiable`. Deduplicates by topic, hard cap at 20 claims.
2. **Auditor** — 3-layer: claim classification bypass → repo routing (language/import profiling) → Cypher search with `LIBRARY_ALIAS_MAP` (110+ aliases) + docstring + source_code (8k chars).
3. **Grader** — 0–100 score:
   - `evidence_base`: 0 / +15 (imports) / +30 (function/class nodes)
   - `node_bonus`: +2/node, capped at +10
   - `depth_bonus`: 0–20 (fn count + import diversity + cyclomatic complexity)
   - `llm_score`: 0–40 (6 snippets × 2k chars semantic analysis)
   - Verified ≥60 · Partially Verified ≥30 · Unverified <30

### Career Coaching Suite
| Feature | Description |
|---|---|
| **Bridge Projects** | N projects targeting verified skill gaps |
| **JD Skills Gap Heatmap** | Triangulates JD requirements vs code score vs ATS presence |
| **Learning Roadmap** | Weekly task distribution with localStorage checkbox persistence |
| **Mock Interview** | Live AI interview calibrated to skill gaps + target JD |
| **Resume Tailoring** | LLM rewrites bullets to match JD (no overclaims) |
| **Salary Intelligence** | Market range + negotiation talking points |
| **Application Kit** | Cover letter + LinkedIn message + cold email |
| **JD URL Import** | Paste a job URL instead of full JD text |
| **Coach Report Export** | Self-contained HTML: gap summary, heatmap, projects, roadmap |

### Project Verification
Three-dimension scoring per project card:
- **Tech Coverage (40%)** — alias-aware evidence search for each claimed technology
- **Architecture Assessment (35%)** — LLM analysis of actual function/class structure + source code
- **Claim Support (25%)** — per-bullet verdict with evidence citations and missing hints

**6 per-card AI features:** View Code, Architecture Snapshot, Interview Prep, Devil's Advocate, Bullet Deep-Dive, and the **Project Deep Dive** panel.

#### Project Deep Dive (`ProjectDeepDive.tsx`)
A 5-tab slide-out panel inside every ProjectCard, powered by `project_deep_dive.py`. All tabs are **lazy-loaded** (fetched only on first click). `Score Card` and `Tech Debt` tabs are disabled for projects where no repo was ingested.

| Tab | What It Provides |
|---|---|
| **Score Card** | 10-dimension rating (0–10 each, aggregate 0–100): Code Complexity Management, Tech Stack Depth, Architecture Quality, Claim Authenticity, Documentation Quality, Modularity & Structure, Dependency Hygiene, Originality & Ambition, Resume Impact, Interview Readiness. Includes executive verdict, strengths, and growth areas. Uses live Neo4j complexity stats. |
| **Summary** | 3-part project description: What it does, How it works technically, Why it matters from a hiring perspective. Fetches the GitHub README (up to 3k chars); falls back to Neo4j docstrings. Includes a one-liner for LinkedIn. |
| **Tech Debt** | Code health (0–100), risk level (Low/Medium/High/Critical), top complexity hotspots with specific function names + refactor suggestions, actionable quick-wins, refactor priority, and positive signals. Backed by Neo4j cyclomatic complexity data. |
| **Skill Signals** | 4–7 evidence-backed skills with `Strong / Medium / Weak` badges, a specific code proof-point for each, and an interview probe angle. Shows top skill and weakest signal summary. |
| **Pitch** | Recruiter-ready 3-sentence pitch + a LinkedIn-optimised 2-sentence version + 15-word tagline + verbal delivery tip. One-click copy button for both versions. Calibrated honestly to the verification score. |

### 3D Knowledge Graph
Built with react-force-graph-3d + Three.js:
- Bloom post-processing (UnrealBloomPass), atmospheric fog
- Neighborhood Focus Mode (hover → non-adjacent nodes dim to 6%)
- AI Graph Summary — 8-section architectural analysis (tech stack, modules, hotspot, suggestions)
- Evidence Highlighting — Show-in-Graph jumps to highlighted node
- Function Explain — per-node AI explanation from NodeInfoPanel
- Path Finder — shortest dependency path between two nodes (`POST /api/graph/path`)
- Analytics Panel, Code Drill-Down, Type/Complexity colour modes
- Multi-repo: comma-separated IDs, up to 25,000 nodes

### Verification Results Dashboard
- Animated SVG donut chart (per-segment glow, click-to-filter stat cards)
- Evidence Strength Meter — 4-bar animated score breakdown per SkillCard
- AI Claim Challenger — Devil's Advocate adversarial counter-argument (≤180 words)
- Score Delta Badges — ↑/↓ vs previous run, localStorage persistence

### AI Resume Toolkit (`/resume-toolkit`)
4-step: Job Search → ATS Optimization → Hiring Manager Lookup → Outreach Email.
Also includes free-text job search via `POST /api/job-finder/search`.

---

## Full API Reference

### Core Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Clone GitHub repo & build Neo4j knowledge graph |
| `POST` | `/api/extract-profile` | Extract GitHub username from PDF + fetch repo list |
| `POST` | `/api/analyze` | Run verification (SSE streaming) |
| `POST` | `/api/analyze/multi` | Multi-repo merged analysis |
| `GET`  | `/api/graph/{repo_id}?limit=5000` | Nodes & edges (comma-separated IDs for multi-repo) |
| `POST` | `/api/graph/path` | Shortest dependency path between two graph nodes |
| `GET`  | `/api/skill-timeline/{repo_id}` | File timeline by language |
| `GET`  | `/api/forensics/{repo_id}` | Authorship & stylometry |
| `GET`  | `/api/heatmap/{repo_id}` | GitHub-style contribution heatmap |
| `GET`  | `/api/repos/ingested` | List all ingested repos |

### AI Graph & Function Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/graph/explain` | 8-section AI architectural summary |
| `POST` | `/api/explain-function` | Per-function AI explanation (purpose, complexity, refactor suggestions) |
| `GET`  | `/api/node-code/{repo_id}/{node_id}` | Raw source code for a Function node |

### Saved Analyses & Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyses` | Save analysis |
| `GET`  | `/api/analyses` | List saved analyses |
| `GET`  | `/api/analyses/{id}` | Get analysis |
| `GET`  | `/api/compare?ids=...` | Compare analyses |
| `POST` | `/api/analyses/{id}/share` | Generate public share token |
| `GET`  | `/api/profile/{token}` | Public profile (no auth) |

### Career Coach & Alex
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/coach` | Generate bridge projects |
| `POST` | `/api/coach/heatmap` | JD Skills Gap Heatmap |
| `POST` | `/api/coach/roadmap` | Week-by-week learning roadmap |
| `POST` | `/api/coach/chat` | Alex chat (non-streaming) → `{ reply, suggestions }` |
| `POST` | `/api/coach/chat/stream` | **Alex streaming SSE chat** |
| `POST` | `/api/coach/insights` | Proactive auto-insight (fires after first analysis) |
| `POST` | `/api/coach/export` | Download HTML Career Coach report |
| `POST` | `/api/coach/memory/save` | Generate + persist session memory (LLM summary, 30-day expiry) |
| `GET`  | `/api/coach/memory/{key}` | Retrieve session memory |
| `POST` | `/api/coach/feedback` | Log 👍/👎 reaction to `feedback.jsonl` |
| `POST` | `/api/coach/fetch-jd` | Fetch + parse JD from URL |
| `POST` | `/api/coach/tailor-resume` | Tailor resume bullets to JD |
| `POST` | `/api/coach/salary-intelligence` | Market salary range from JD |
| `POST` | `/api/coach/application-kit` | Cover letter + LinkedIn + cold email |
| `POST` | `/api/coach/mock-interview/questions` | Generate mock interview questions |
| `POST` | `/api/coach/mock-interview/grade` | Grade a mock interview answer |
| `POST` | `/api/extract-resume-text` | Extract text from uploaded PDF |

### Project Verification
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze/projects` | Verify all projects against ingested repos |
| `POST` | `/api/analyze/projects/single` | Re-verify single project |
| `POST` | `/api/projects/interview-questions` | 6 project-scoped interview questions |
| `POST` | `/api/projects/challenge` | Devil's Advocate for project verdict |
| `POST` | `/api/projects/architecture-snapshot` | Deep architectural analysis |
| `POST` | `/api/projects/explain-missing-bullet` | Explain unverified bullet + what code would prove it |
| `POST` | `/api/projects/deep-dive/scorecard` | 10-dimension scorecard (0–100 aggregate) from Neo4j stats |
| `POST` | `/api/projects/deep-dive/summary` | 3-part project description (README-fetching) |
| `POST` | `/api/projects/deep-dive/tech-debt` | Code health, hotspots, quick-wins, risk level |
| `POST` | `/api/projects/deep-dive/skill-signals` | Evidence-backed skills with Strong/Medium/Weak ratings |
| `POST` | `/api/projects/deep-dive/recruiter-pitch` | Pitch paragraph + LinkedIn version + tagline |

### Benchmarks, Interview Prep & ATS
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/benchmarks/generate` | LLM role benchmark scores |
| `GET`  | `/api/benchmarks` | List cached benchmarks |
| `GET`  | `/api/benchmarks/{role_slug}` | Get benchmark by role |
| `POST` | `/api/interview-questions` | Skill-scoped interview questions |
| `POST` | `/api/challenge-claim` | Devil's Advocate for skill claim verdict |
| `POST` | `/api/ats-score` | Full ATS evaluation |
| `POST` | `/api/ats-report` | Download HTML ATS report |
| `POST` | `/api/export-report` | Download HTML verification report |

### Resume Toolkit & Job Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume-toolkit/find-jobs` | Job search from PDF (role inferred by LLM) |
| `POST` | `/api/resume-toolkit/optimize-keywords` | ATS keyword rewriting |
| `POST` | `/api/resume-toolkit/find-hiring-manager` | Apollo.io → email pattern fallback |
| `POST` | `/api/resume-toolkit/draft-email` | Personalized outreach email |
| `POST` | `/api/job-finder/search` | Free-text job search (no PDF required) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | App health |
| `GET` | `/api/health/db` | Neo4j AuraDB connectivity |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Vanilla CSS |
| 3D Graph | react-force-graph-3d, Three.js |
| Charts | Recharts |
| Backend | Python 3.9+, FastAPI, Pydantic v2 |
| AI Orchestration | LangChain, LangGraph |
| LLM | Groq — Llama 3.3 70B (`langchain_groq`) |
| AST Parsing | tree-sitter (Python, JS, TS, Go, Java, Rust) |
| Graph Database | Neo4j AuraDB (cloud) |
| Relational Storage | SQLite (`trueskill_analyses.db`) |
| Local Data | JSON flat-files (`backend/data/`) |
| HTTP Client | httpx (async) |
| PDF Extraction | PyPDF2 |

---

## Environment Variables

```env
# Neo4j AuraDB — console.neo4j.io
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<username>
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=<database-name>

# Groq (required)
GROQ_API_KEY=your_key_here
GROQ_API_KEY_BACKUP=your_backup_key   # auto-used on 429 errors

# GitHub (optional — avoids rate limits)
GITHUB_TOKEN=your_token

# Optional integrations
JOOBLE_API_KEY=your_key
APOLLO_API_KEY=your_key               # free tier: /people/match fallback
```

> `.env` and `Neo4j-*.txt` are excluded via `.gitignore`. Never commit them.

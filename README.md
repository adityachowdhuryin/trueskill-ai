# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

A multi-agent system that cross-references PDF resume claims against actual GitHub repository code analysis — using cyclomatic complexity scoring, coding stylometry, and a **Neo4j AuraDB** knowledge graph. Includes **Alex**, a proactive AI career co-pilot with streaming chat, cross-session memory, live screen awareness, and agentic tool-calling.

---

## Project Structure

```
trueskill-ai/
├── backend/                         # FastAPI Python backend
│   ├── app/
│   │   ├── api.py                   # All API routes (40+ endpoints)
│   │   ├── agents.py                # LangGraph verification workflow (Parser → Auditor → Grader)
│   │   ├── alias_map.py             # Library alias map (110+ entries: PyTorch→torch, OpenCV→cv2, etc.)
│   │   ├── ingest.py                # GitHub repo cloning & AST parsing (6 languages)
│   │   ├── forensics.py             # Stylometric authorship analysis
│   │   ├── ats.py                   # ATS resume scoring & HTML report
│   │   ├── benchmarks.py            # LLM-generated role skill benchmarks
│   │   ├── interview.py             # AI interview question generator
│   │   ├── coach.py                 # Gap analysis, bridge projects, heatmap, roadmap,
│   │   │                            #   streaming chat (Alex), cross-session memory, agentic actions
│   │   ├── jd_fetcher.py            # Fetch & parse live JD URLs
│   │   ├── challenge.py             # Adversarial LLM claim challenger (Devil's Advocate)
│   │   ├── project_verifier.py      # Project verification (tech coverage, arch score, bullet verdicts)
│   │   ├── project_features.py      # Project-scoped LLM features
│   │   ├── job_finder.py            # Jooble job search & Apollo.io hiring manager lookup
│   │   ├── resume_optimizer.py      # LLM keyword rewriting & email drafting
│   │   ├── report.py                # HTML verification report generator
│   │   ├── storage.py               # SQLite persistence (analyses + share tokens)
│   │   ├── db.py                    # Neo4j AuraDB driver & query helpers
│   │   ├── graph_explain.py         # AI architectural summary (8-section JSON via Groq)
│   │   ├── function_explain.py      # Per-function AI explanation
│   │   └── llm.py                   # Shared LLM client (Groq Llama 3.3 70B) + backup key rotation
│   ├── data/                        # Local data storage (git-ignored)
│   │   ├── memories.json            # Alex cross-session memory (30-day expiry per user)
│   │   └── feedback.jsonl           # 👍/👎 reaction log (newline-delimited JSON)
│   ├── main.py                      # FastAPI entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                        # Next.js 14 frontend
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Landing / marketing page
│       │   ├── dashboard/           # Main verification dashboard
│       │   ├── compare/             # Multi-candidate comparison view
│       │   ├── resume-toolkit/      # 4-step AI Resume Toolkit
│       │   └── profile/[id]/        # Public shareable verified profile page
│       └── components/
│           ├── TrueSkillAssistant.tsx   # Alex — AI career coach floating panel (full feature set)
│           ├── MockInterview.tsx        # Live AI mock interview session
│           ├── TailoredResume.tsx       # Resume tailoring result panel
│           ├── SalaryIntelligenceCard.tsx # Salary intelligence result card
│           ├── ApplicationKit.tsx       # Application kit generator (cover letter, LinkedIn, email)
│           ├── JdUrlInput.tsx           # URL-based JD import
│           ├── MatchingJobsPanel.tsx    # Matching jobs from JD analysis
│           ├── GraphVisualizer.tsx      # 3D force-graph: bloom, focus, AI summary, evidence highlighting
│           ├── GraphFullscreenModal.tsx
│           ├── ErrorBoundary.tsx        # React error boundary for graph & heavy components
│           ├── ATSScorePanel.tsx        # ATS evaluation results panel
│           ├── SkillCard.tsx            # Per-claim card: score bar, evidence, interview prep, devil's advocate
│           ├── ProjectCard.tsx          # Per-project card: tech coverage, arch score, bullet verdicts + 5 AI features
│           ├── ProjectSummaryBar.tsx    # Project verification summary banner
│           ├── CodeViewer.tsx           # Source code modal with inline syntax highlighting
│           ├── SkillRadar.tsx           # Radar chart with LLM-generated benchmarks
│           ├── ContributionHeatmap.tsx  # GitHub-style commit heatmap
│           ├── VerifiedBadge.tsx        # Shareable public profile badge
│           ├── ResumeOptimizer.tsx      # ATS keyword rewriting UI
│           ├── EmailComposer.tsx        # Personalized outreach email UI
│           ├── JobCard.tsx              # Job posting card
│           ├── SkillTimeline.tsx        # Language timeline chart
│           ├── Navbar.tsx               # Scroll-aware shared navbar
│           ├── Skeletons.tsx            # Loading skeletons
│           ├── AnimatedCounter.tsx
│           ├── SkillsGapHeatmap.tsx     # JD Skills Gap Heatmap
│           ├── LearningRoadmap.tsx      # Week-by-week learning roadmap with task checkboxes
│           ├── CoachChat.tsx            # Legacy conversational coach chat panel
│           └── VerificationSummaryBar.tsx # Animated summary dashboard (donut chart, stat cards)
├── docker-compose.yml               # Local Neo4j container config (legacy — AuraDB preferred)
├── start_all.py                     # One-command dev stack launcher
├── project_spec.md                  # Full technical specification
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.9+
- A **Neo4j AuraDB** free-tier instance — [console.neo4j.io](https://console.neo4j.io)

### Option 1 — One-Command Launch (Recommended)

```bash
python start_all.py
```

Automatically:
1. Verifies AuraDB configuration in `backend/.env`
2. Creates a Python virtualenv and installs backend deps
3. Starts FastAPI with hot-reload on `:8000`
4. Starts Next.js dev server on `:3000`

Press `Ctrl+C` to stop all services gracefully.

### Option 2 — Manual

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your credentials
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Access Points
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| DB Health Check | http://localhost:8000/api/health/db |

---

## Key Features

### Alex — AI Career Co-Pilot
Alex is a proactive, intelligent career coach embedded as a floating panel in the dashboard:

- **Streaming chat** — tokens stream immediately with no truncation; internal command blocks (`<!-- -->`) are stripped cleanly from the final reply
- **Capability Welcome Screen** — 7 interactive capability cards shown on first open, each with a clickable example question. Cards are context-aware (locked when no analysis has been run yet)
- **Smart Rotating Suggestions** — 5 categories × 5 chips cycling through all capability areas after each exchange (Career Coach → Skills → ATS → Projects → Strategy). LLM-generated suggestions take priority when available
- **Agentic Tool-Calling** — Alex can trigger 5 career workflows inline: Mock Interview, Resume Tailoring, Salary Intelligence, Application Kit, ATS Score Run
- **Live Screen Awareness** — `focused_on` context tracks which dashboard tab is active; Alex knows what you're looking at
- **Cross-Session Memory** — LLM-generated session summary persisted per GitHub username (30-day expiry). Loaded on mount via `GET /api/coach/memory/{key}` and saved via `sendBeacon` on page unload
- **Voice Input** — Web Speech API (Mic button; pulse animation while recording; auto-hides in unsupported browsers)
- **Reactions** — 👍/👎 buttons appear on hover over any Alex message; reactions logged to `feedback.jsonl`
- **Expand toggle** — Normal (400×560) ↔ Expanded (680×740) with smooth transition
- **In-chat search** — Ctrl+F toggles search; highlights matching messages
- **Export chat** — Downloads full conversation as a `.md` file
- **Clear conversation** — With confirmation dialog

### Verification Pipeline
Three-agent LangGraph workflow:
1. **Parser** — Extracts `ResumeClaim` list from PDF; classifies as code_verifiable/not_code_verifiable; deduplicates by topic; cap of 20 claims
2. **Auditor** — 3-layer scoped search: claim classification → repo routing → Cypher with LIBRARY_ALIAS_MAP (110+ entries) + docstring search
3. **Grader** — 0–100 score: evidence_base (+30 max) + node_bonus (+10 max) + depth_bonus (+20 max) + llm_score (+40 max)
   - Verified ≥ 60 · Partially Verified ≥ 30 · Unverified < 30

### Career Coaching Suite
- **Bridge Project Generation** — N projects targeting specific skill gaps
- **JD Skills Gap Heatmap** — Triangulates JD requirements vs code score vs ATS resume presence
- **Week-by-Week Learning Roadmap** — Realistic task distribution with localStorage checkbox persistence
- **Mock Interview** — Live AI interview calibrated to verified skill gaps and target JD
- **Resume Tailoring** — LLM-powered bullet rewrites matched to JD (no overclaims)
- **Salary Intelligence** — Market range + negotiation talking points from JD
- **Application Kit** — Cover letter, LinkedIn message, cold email in one click
- **JD URL Import** — Paste a job URL instead of copying the full JD text

### Project Verification
Three-dimension scoring per project:
- **Tech Coverage (40%)** — alias-aware evidence search for each claimed technology
- **Architecture Assessment (35%)** — LLM analysis of actual function/class structure
- **Claim Support (25%)** — per-bullet verdict with evidence citations

5 on-demand AI features per project card: View Code, Architecture Snapshot, Interview Prep, Devil's Advocate, Bullet Deep-Dive.

### 3D Knowledge Graph
- **Bloom post-processing** — cinematic neon glow
- **Neighborhood Focus Mode** — hover any node, non-adjacent nodes dim
- **AI Graph Summary** — 8-section architectural analysis (tech stack, modules, hotspots, suggestions)
- **Evidence Highlighting** — Show-in-Graph jumps to 3D graph with node highlighted amber
- **Path Finder** — shortest dependency path between two nodes
- **Code Drill-Down** — view raw function source in a modal
- Multi-repo: comma-separated repo IDs for combined view (up to 25,000 nodes)

### Verification Results Dashboard
- **Animated SVG donut chart** — per-segment glow, avg score in centre, click-to-filter
- **Evidence Strength Meter** — 4-bar animated score breakdown per SkillCard
- **AI Claim Challenger** — Devil's Advocate adversarial counter-argument (≤180 words)
- **Score Delta Badges** — ↑/↓ vs previous run, persisted in localStorage

### AI Resume Toolkit (`/resume-toolkit`)
4-step workflow: Job Search → ATS Optimization → Hiring Manager Lookup → Outreach Email

---

## API Endpoints

### Core Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Clone GitHub repo & build Neo4j knowledge graph |
| `POST` | `/api/extract-profile` | Extract GitHub username from PDF + fetch repo list |
| `POST` | `/api/analyze` | Run agent workflow (SSE streaming response) |
| `POST` | `/api/analyze/multi` | Run analysis across multiple repos (merged result) |
| `GET`  | `/api/graph/{repo_id}?limit=5000` | Nodes & edges for 3D graph — comma-separated IDs for multi-repo |
| `GET`  | `/api/skill-timeline/{repo_id}` | File timeline grouped by language |
| `GET`  | `/api/forensics/{repo_id}` | Authorship & stylometry data |
| `GET`  | `/api/repos/ingested` | List all ingested repos (id, name, url) |

### AI Graph Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/graph/explain` | 8-section AI architectural summary via Groq |
| `POST` | `/api/function/explain` | Per-function AI explanation |

### Saved Analyses & Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyses` | Save an analysis |
| `GET`  | `/api/analyses` | List all saved analyses |
| `GET`  | `/api/analyses/{id}` | Get a specific analysis |
| `GET`  | `/api/compare?ids=...` | Compare multiple analyses |
| `POST` | `/api/analyses/{id}/share` | Generate a public share token |
| `GET`  | `/api/profile/{token}` | Retrieve public profile (no auth) |

### Career Coach
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/coach` | Generate bridge projects for skill gaps |
| `POST` | `/api/coach/heatmap` | JD Skills Gap Heatmap |
| `POST` | `/api/coach/roadmap` | Week-by-week learning roadmap |
| `POST` | `/api/coach/chat/stream` | **Alex streaming SSE chat** |
| `POST` | `/api/coach/export` | Download HTML Career Coach report |
| `POST` | `/api/coach/memory/save` | Generate & persist session memory |
| `GET`  | `/api/coach/memory/{key}` | Retrieve session memory |
| `POST` | `/api/coach/feedback` | Log 👍/👎 reaction |
| `POST` | `/api/coach/fetch-jd` | Fetch & parse JD from URL |
| `POST` | `/api/coach/tailor-resume` | Tailor resume bullets to JD |
| `POST` | `/api/coach/salary-intelligence` | Market salary range from JD |
| `POST` | `/api/coach/application-kit` | Cover letter + LinkedIn + cold email |
| `POST` | `/api/coach/extract-resume-text` | Extract text from resume PDF |

### Mock Interview
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/interview-questions` | Generate skill-scoped interview questions |
| `POST` | `/api/mock-interview` | Start a mock interview session |
| `POST` | `/api/mock-interview/grade` | Grade a mock interview answer |

### Project Verification
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze/projects` | Verify all projects against ingested repos |
| `POST` | `/api/analyze/projects/single` | Re-verify a single project |
| `POST` | `/api/projects/interview-questions` | Project-scoped interview questions |
| `POST` | `/api/projects/challenge` | Devil's Advocate for project verdict |
| `POST` | `/api/projects/architecture-snapshot` | Deep architectural analysis |
| `POST` | `/api/projects/explain-missing-bullet` | Explain unverified bullet |

### Verification Enhancements & ATS
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/challenge-claim` | Devil's Advocate for skill claim |
| `GET`  | `/api/node-code/{repo_id}/{node_id}` | Fetch function source code |
| `POST` | `/api/benchmarks/generate` | LLM role benchmark scores |
| `POST` | `/api/ats-score` | Full ATS evaluation |
| `POST` | `/api/ats-report` | Download HTML ATS report |
| `POST` | `/api/export-report` | Download HTML verification report |

### AI Resume Toolkit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume-toolkit/find-jobs` | Job search from PDF |
| `POST` | `/api/resume-toolkit/optimize-keywords` | ATS keyword rewriting |
| `POST` | `/api/resume-toolkit/find-hiring-manager` | Apollo.io → email pattern |
| `POST` | `/api/resume-toolkit/draft-email` | Personalized outreach email |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Application health check |
| `GET` | `/api/health/db` | Neo4j AuraDB connectivity check |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Vanilla CSS |
| **3D Graph** | react-force-graph-3d, Three.js |
| **Charts** | Recharts |
| **Backend** | Python 3.9+, FastAPI, Pydantic v2 |
| **AI Orchestration** | LangChain, LangGraph |
| **LLM** | Groq — Llama 3.3 70B (`langchain_groq`) |
| **AST Parsing** | tree-sitter (Python, JS, TS, Go, Java, Rust) |
| **Graph Database** | Neo4j AuraDB (cloud) |
| **Relational Storage** | SQLite (`trueskill_analyses.db`) |
| **Local Data** | JSON flat-files (`backend/data/`) |
| **HTTP Client** | httpx (async) |
| **PDF Extraction** | PyPDF2 |

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
# Neo4j AuraDB (cloud) — get from console.neo4j.io
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<username>
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=<database-name>

# Groq (required — powers all LLM calls)
GROQ_API_KEY=your_groq_api_key_here
GROQ_API_KEY_BACKUP=your_backup_key_here   # optional — auto-used on 429 rate-limit errors

# GitHub Token (optional — avoids rate limits on repo fetch)
GITHUB_TOKEN=your_github_token_here

# Optional integrations
JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key   # Free tier: enables /people/match fallback
```

> **Security note:** Never commit `.env` or `Neo4j-*.txt` files — both are listed in `.gitignore`.

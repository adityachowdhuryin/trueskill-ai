# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

A multi-agent system that cross-references PDF resume claims against actual GitHub repository code analysis — using cyclomatic complexity scoring, coding stylometry, and a **Neo4j AuraDB** knowledge graph.

---

## Project Structure

```
trueskill-ai/
├── backend/                         # FastAPI Python backend
│   ├── app/
│   │   ├── api.py                   # All API routes (30+ endpoints)
│   │   ├── agents.py                # LangGraph verification workflow (Parser → Auditor → Grader)
│   │   ├── ingest.py                # GitHub repo cloning & AST parsing (6 languages)
│   │   ├── forensics.py             # Stylometric authorship analysis
│   │   ├── ats.py                   # ATS resume scoring & HTML report
│   │   ├── benchmarks.py            # LLM-generated role skill benchmarks
│   │   ├── interview.py             # AI interview question generator
│   │   ├── coach.py                 # Gap analysis, bridge projects, heatmap, roadmap, chat & HTML export
│   │   ├── challenge.py             # Adversarial LLM claim challenger (Devil's Advocate)
│   │   ├── job_finder.py            # Jooble job search & Apollo.io hiring manager lookup
│   │   ├── resume_optimizer.py      # LLM-driven keyword rewriting & email drafting
│   │   ├── report.py                # HTML verification report generator
│   │   ├── storage.py               # SQLite persistence (analyses + share tokens)
│   │   ├── db.py                    # Neo4j AuraDB driver & query helpers
│   │   ├── graph_explain.py         # AI architectural summary (8-section structured JSON via Groq)
│   │   ├── function_explain.py      # Per-function AI explanation with complexity & suggestion
│   │   └── llm.py                   # Shared LLM client (Groq Llama 3.3 70B)
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
│           ├── GraphVisualizer.tsx  # 3D force-graph: bloom, fog, hover-focus, path finder, AI summary, evidence highlighting
│           ├── GraphFullscreenModal.tsx
│           ├── ErrorBoundary.tsx    # React error boundary for graph & heavy components
│           ├── ATSScorePanel.tsx    # ATS evaluation results panel
│           ├── SkillCard.tsx        # Per-claim card: score bar, evidence, "Show in Graph", interview prep, code drill-down
│           ├── CodeViewer.tsx       # Source code modal with inline syntax highlighting
│           ├── SkillRadar.tsx       # Radar chart with LLM-generated benchmarks
│           ├── ContributionHeatmap.tsx # GitHub-style commit heatmap
│           ├── VerifiedBadge.tsx    # Shareable public profile badge
│           ├── ResumeOptimizer.tsx  # ATS keyword rewriting UI
│           ├── EmailComposer.tsx    # Personalized outreach email UI
│           ├── JobCard.tsx          # Job posting card
│           ├── SkillTimeline.tsx    # Language timeline chart
│           ├── Navbar.tsx           # Scroll-aware shared navbar
│           ├── Skeletons.tsx        # Loading skeletons
│           ├── AnimatedCounter.tsx
│           ├── SkillsGapHeatmap.tsx # JD Skills Gap Heatmap (code score vs resume vs JD requirements)
│           ├── LearningRoadmap.tsx  # Week-by-week learning roadmap with task checkboxes
│           ├── CoachChat.tsx        # Conversational AI coach chat panel
│           └── VerificationSummaryBar.tsx # Animated summary dashboard (donut chart, stat cards, filter)
├── docker-compose.yml               # (Legacy) local Neo4j container config
├── start_all.py                     # One-command dev stack launcher
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 20+ (for frontend)
- Python 3.9+ (for backend)
- A **Neo4j AuraDB** free-tier instance — [console.neo4j.io](https://console.neo4j.io)

### Option 1 — One-Command Launch (Recommended)

```bash
python start_all.py
```

This script automatically:
1. Verifies your AuraDB configuration in `backend/.env`
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
cp .env.example .env   # fill in your AuraDB credentials + API keys
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

## API Endpoints

### Core Verification Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Clone GitHub repo & build Neo4j knowledge graph |
| `POST` | `/api/extract-profile` | Extract GitHub username from PDF + fetch repo list |
| `POST` | `/api/analyze` | Run agent workflow (SSE streaming response) |
| `POST` | `/api/analyze/multi` | Run analysis across multiple repos (merged result) |
| `GET`  | `/api/graph/{repo_id}?limit=5000` | Nodes & edges for 3D graph — supports comma-separated repo IDs for multi-repo |
| `GET`  | `/api/skill-timeline/{repo_id}` | File timeline grouped by language |
| `GET`  | `/api/forensics/{repo_id}` | Authorship & stylometry data |

### AI Graph Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/graph/explain` | 8-section AI architectural summary: tech stack, modules, hotspot risk, improvement suggestions (Groq Llama 3.3 70B) |
| `POST` | `/api/function/explain` | Per-function AI explanation with complexity verdict, purpose, and refactor suggestions |

### Saved Analyses & Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyses` | Save an analysis result |
| `GET`  | `/api/analyses` | List all saved analyses |
| `GET`  | `/api/analyses/{id}` | Get a specific saved analysis |
| `GET`  | `/api/compare?ids=...` | Compare multiple analyses |
| `POST` | `/api/analyses/{id}/share` | Generate a public share token |
| `GET`  | `/api/profile/{token}` | Retrieve public profile (no auth) |

### Benchmarks & Interview Prep
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/benchmarks/generate` | LLM-generates role benchmark scores for a given skill topic list |
| `POST` | `/api/interview-questions` | Generates personalised interview questions for a verified skill |

### Evidence Code Drill-Down
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/node-code/{repo_id}/{node_id}` | Fetch raw source code for a Function node — returns `source_code`, `name`, `file_path`, `line_start/end`, `complexity_score`, `args` |

### Career Coach
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/coach` | Generate N bridge projects for skill gaps (configurable 1–5) |
| `POST` | `/api/coach/heatmap` | JD Skills Gap Heatmap — triangulates JD requirements vs code score vs ATS resume match |
| `POST` | `/api/coach/roadmap` | Week-by-week learning roadmap from bridge projects + available hours/week |
| `POST` | `/api/coach/chat` | Conversational AI coaching — context-aware follow-up Q&A |
| `POST` | `/api/coach/export` | Download self-contained HTML Career Coach report |

### Verification Results Enhancements
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/challenge-claim` | Devil's Advocate — LLM argues the *opposite* verdict for a skill claim (rate-limited) |

### ATS Tools
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ats-score` | Full ATS evaluation of resume vs job description |
| `POST` | `/api/ats-report` | Download self-contained HTML ATS report |
| `POST` | `/api/export-report` | Download HTML verification report |

### AI Resume Toolkit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume-toolkit/find-jobs` | Infer role from resume, search Jooble |
| `POST` | `/api/resume-toolkit/optimize-keywords` | ATS keyword rewriting via LLM |
| `POST` | `/api/resume-toolkit/find-hiring-manager` | Apollo.io lookup → people/match (free) → pattern fallback |
| `POST` | `/api/resume-toolkit/draft-email` | Draft personalized outreach email |

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
| **HTTP Client** | httpx (async) |
| **PDF Extraction** | PyPDF2 |

---

## Key Features

### Verification Pipeline
The core LangGraph workflow runs three sequential agents:
1. **Parser** — Extracts structured technical claims from resume PDF
2. **Auditor** — Queries the Neo4j knowledge graph using topic-synonym expansion
3. **Grader** — Scores each claim 0–100 using evidence count, cyclomatic complexity alignment, and LLM reasoning

Results stream back to the frontend via **Server-Sent Events (SSE)**.

### Ingestion Engine
- Shallow-clones GitHub repos (depth=1, LFS-safe)
- Parses **6 languages**: Python, JavaScript, TypeScript, Go, Java, Rust via tree-sitter
- Extracts `File`, `Class`, `Function`, `Import` nodes + relationships into Neo4j AuraDB
- Computes **cyclomatic complexity** for every function

### 3D Knowledge Graph

The `/api/graph/{repo_id}` endpoint supports large repositories:
- **Default limit**: 5,000 nodes (configurable up to 25,000 via `?limit=N`)
- **Sampling priority**: Files → Classes → Functions (top complexity first) → Imports
- **Multi-repo**: Pass comma-separated IDs for a combined view
- **Server-side edge filtering**: Only edges between sampled nodes are returned

#### 3D Graph Visual & UX Features
| Feature | Description |
|---------|-------------|
| **Bloom Post-Processing** | `UnrealBloomPass` — cinematic neon glow on all nodes and link particles |
| **Neighborhood Focus Mode** | Hover any node → non-adjacent nodes dim to 6% opacity via direct Three.js material mutation |
| **AI Graph Summary** | ✨ **Explain** button → 8-section AI architectural analysis: tech stack inference, module breakdown, hotspot risk callout, improvement suggestions (collapsible UI) |
| **Evidence Node Highlighting** | 📍 **Show in Graph** on any evidence row in SkillCard → tab switches to 3D Graph with that node highlighted amber; all others dimmed |
| **Function Explain** | Click any `Function` node → NodeInfoPanel → **✨ Explain** button → AI explanation of purpose, complexity verdict, refactor suggestions |
| **Path Finder** | Select start/end nodes to find the shortest dependency path between them |
| **Analytics Panel** | Top hub nodes, isolated nodes, node type breakdown |
| **Code Drill-Down** | Click a `Function` node → "👁 View Source Code" → opens `CodeViewer` modal |
| **Physics Tweaks** | d3-force charge strength set to -180 for better node spacing |
| **Reset Camera** | `fgRef.zoomToFit(600)` snaps back to overview |
| **Atmospheric Fog** | `THREE.FogExp2` makes distant nodes fade into the dark background |
| **Screenshot Export** | Saves `knowledge-graph.png` from the WebGL canvas |
| **First-load Fix** | Dimension measurement deferred via `requestAnimationFrame` so ForceGraph3D always initializes at correct container size |

### AI Graph Summary (`graph_explain.py`)
The ✨ **Explain** button sends rich structural context to Groq Llama 3.3 70B and receives a structured 8-section JSON response rendered as a collapsible panel:
- **Tech Stack** — inferred from file names, imports, and node types (indigo pills)
- **Overview** — 3–4 sentence architectural summary
- **Key Observations** — 5 specific bullets naming actual files/functions (expandable)
- **⚠ Hotspot Risk** — orange callout identifying highest-risk maintenance areas
- **Module Breakdown** — logical subsystem grouping with key file tags (collapsed by default)
- **Improvement Suggestions** — 3 numbered actionable refactoring recommendations (collapsed by default)
- **Complexity Verdict** — architecture style badge + complexity rating

### Stylometric Forensics
The `forensics.py` module detects AI-generated or copy-pasted code via:
- Variable naming convention analysis (snake_case / camelCase / PascalCase)
- Shannon entropy of style consistency
- Git commit pattern analysis (bulk single-commit additions flag)
- Overall authenticity score (0–100) with verdict: Authentic / Suspicious / Highly Suspicious

### AI Resume Toolkit (4-Step Workflow)
A self-contained page (`/resume-toolkit`) that guides users through:
1. **Job Search** — Upload PDF → LLM infers role/location → Jooble job listings
2. **ATS Optimization** — Resume vs JD keyword analysis → LLM rewrites Skills/Summary
3. **Hiring Manager Lookup** — Apollo.io paid search → free-tier `/people/match` → email pattern fallback
4. **Outreach Email** — LLM drafts a personalized cold email for the role

### Verification Results Features
The dashboard Skills tab now includes 4 high-impact enhancements:

#### Verification Summary Dashboard (`VerificationSummaryBar.tsx`)
A premium analytics banner pinned above the filter toolbar:
- **Animated donut chart** — multi-segment SVG with colour-matched glow (emerald/amber/rose-red per segment) and avg score in the centre
- **3 stat cards** — Verified / Partial / Unverified counts; clicking any card instantly filters the skill list; clicking again resets
- **Context-aware hint** — shows "Click a card to filter" when no filter is active; shows "Clear filter" button when a filter is applied

#### Evidence Strength Meter
Inside each expanded `SkillCard`, a **4-bar transparent score breakdown panel** shows the sub-scores that make up the final 0–100 score:
| Bar | Max | Colour |
|-----|-----|--------|
| Evidence Presence | 30 | Indigo |
| Node Bonus | 20 | Indigo |
| Complexity Match | 20 | Amber |
| AI Reasoning Quality | 30 | Violet |
The grader (`agents.py`) now returns a `score_breakdown` dict alongside every `VerificationResult`.

#### AI Claim Challenger / Devil's Advocate
- A **"🔴 Challenge This Verdict"** button at the bottom of each expanded SkillCard
- Calls `POST /api/challenge-claim` → `challenge.py` sends an adversarial system prompt to Groq Llama 3.3 70B, instructing it to argue the opposite verdict
- Returns a ≤180-word sceptical counter-argument rendered in a red-tinted callout box
- Result is cached per card; clicking again toggles visibility

#### Score Delta / Re-run History
- On the **second and subsequent analysis runs**, each SkillCard shows a **delta badge** next to its score bar: `↑+12` (emerald) or `↓-5` (red)
- Score history is persisted in `localStorage` keyed by skill topic — survives browser restarts
- Pairs naturally with the Career Coach: complete a roadmap item → re-run → see score go up

### Skills Verification Section
The dashboard Skills tab is a premium credential report panel:
- **Sorted display:** Verified → Partially Verified → Unverified, then score descending
- **Filter toolbar:** Instant search by skill name, status dropdown, Expand All / Collapse All
- **Animated score bar:** Fills 0→score on mount, color-coded green/amber/red
- **Parsed evidence nodes:** `path/file.py:function_name` rendered as file-type badges (PY/TS/JS)
- **📍 Show in Graph:** Hover any evidence row → click to jump to 3D Graph with that node highlighted
- **Evidence Code Drill-Down:** Hover any evidence row → `👁 View` → opens `CodeViewer` modal
- **AI Interview Prep:** 5 personalised questions per skill with collapsible hints and Copy All button

### Career Coach (Enhanced)
The Career Coach section transforms skill gap analysis into a full professional development tool:

#### JD Skills Gap Heatmap (`SkillsGapHeatmap.tsx`)
A sortable table that **triangulates three signals simultaneously** — the only feature in the app to do so:
| Column | Source |
|--------|--------|
| **JD Requirement** | Extracted from pasted job description by LLM |
| **In Resume?** | From ATS `keyword_matches` (if ATS already run) — no extra LLM call |
| **Code Score** | From verified code analysis (0–100) |
| **Gap Severity** | Critical / Moderate / Minor / None based on code score |
| **Tip** | 1-line actionable recommendation |

Sort by any column. Color-coded severity badges and animated score bars.

#### Week-by-Week Learning Roadmap (`LearningRoadmap.tsx`)
- Select available hours/week (5 / 10 / 20 / 40h presets)
- LLM distributes bridge projects across a realistic weekly schedule
- Each week card: focus skill, 3–4 concrete tasks, milestone badge
- **Task checkboxes persist to `localStorage`** — survive page refresh
- Progress bar shows overall completion %

#### Conversational Coach Chat (`CoachChat.tsx`)
- Context-aware AI Q&A seeded with bridge projects, gap summary, and verified skills
- Pre-loaded suggested questions: "What should I focus on first?", "Can I finish this in 2 weeks?", etc.
- Typing indicator + message thread with timestamps
- Chat messages persist to `sessionStorage`

#### Export Coach Report
- One-click download of a self-contained HTML report (no external deps)
- Sections: Gap Summary → Skills Gap Heatmap → Bridge Projects → Learning Roadmap
- Same pattern as existing ATS HTML report

### Shareable Verified Profile
After running an analysis:
1. Click **Share Profile** → backend generates a random URL-safe token stored in SQLite
2. A public profile URL (`/profile/<token>`) is copied to clipboard
3. The `/profile/[id]` page shows the full verified credential report — no login required
4. Share tokens survive server restarts (persisted in SQLite)

### Skill Radar + Benchmarking
The Radar tab compares verified skill scores against LLM-generated role benchmarks:
- Sends the candidate's **exact verified topic names** to `POST /api/benchmarks/generate`
- LLM returns a score for each topic for the selected role (e.g. "ML Engineer")
- Both traces use the same topic list → no alignment zeros possible

### Candidate Comparison
The `/compare` page loads two or more saved analyses side-by-side for HR-style screening.

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

# GitHub Token (optional — avoids rate limits on repo fetch)
GITHUB_TOKEN=your_github_token_here

# Optional integrations
JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key   # Free tier: enables /people/match fallback
```

> **Security note:** Never commit `.env` or `Neo4j-*.txt` files — both are listed in `.gitignore`.

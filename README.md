# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

A multi-agent system that cross-references PDF resume claims against actual GitHub repository code analysis — using cyclomatic complexity scoring, coding stylometry, and a **Neo4j AuraDB** knowledge graph.

---

## Project Structure

trueskill-ai/
├── backend/                         # FastAPI Python backend
│   ├── app/
│   │   ├── api.py                   # All API routes (20+ endpoints)
│   │   ├── agents.py                # LangGraph verification workflow (Parser → Auditor → Grader)
│   │   ├── ingest.py                # GitHub repo cloning & AST parsing (6 languages)
│   │   ├── forensics.py             # Stylometric authorship analysis
│   │   ├── ats.py                   # ATS resume scoring & HTML report
│   │   ├── benchmarks.py            # LLM-generated role skill benchmarks
│   │   ├── interview.py             # AI interview question generator
│   │   ├── coach.py                 # Gap analysis & bridge project generator
│   │   ├── job_finder.py            # Jooble job search & Apollo.io hiring manager lookup
│   │   ├── resume_optimizer.py      # LLM-driven keyword rewriting & email drafting
│   │   ├── report.py                # HTML verification report generator
│   │   ├── storage.py               # SQLite persistence (analyses + share tokens)
│   │   ├── db.py                    # Neo4j AuraDB driver & query helpers
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
│           ├── GraphVisualizer.tsx  # 3D force-graph with smart sampling banner
│           ├── GraphFullscreenModal.tsx
│           ├── ATSScorePanel.tsx    # ATS evaluation results panel
│           ├── SkillCard.tsx        # Per-claim card: score bar, parsed evidence, interview prep
│           ├── SkillRadar.tsx       # Radar chart with LLM-generated benchmarks
│           ├── ContributionHeatmap.tsx # GitHub-style commit heatmap
│           ├── VerifiedBadge.tsx    # Shareable public profile badge
│           ├── ResumeOptimizer.tsx  # ATS keyword rewriting UI
│           ├── EmailComposer.tsx    # Personalized outreach email UI
│           ├── JobCard.tsx          # Job posting card
│           ├── SkillTimeline.tsx    # Language timeline chart
│           ├── Navbar.tsx           # Scroll-aware shared navbar
│           ├── Skeletons.tsx        # Loading skeletons
│           └── AnimatedCounter.tsx
├── docker-compose.yml               # (Legacy) local Neo4j container config
├── start_all.py                     # One-command dev stack launcher
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 20+ (for frontend)
- Python 3.11+ (for backend)
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

### Career & ATS Tools
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/coach` | Generate bridge project for skill gaps |
| `POST` | `/api/ats-score` | Full ATS evaluation of resume vs job description |
| `POST` | `/api/ats-report` | Download self-contained HTML ATS report |
| `POST` | `/api/export-report` | Download HTML verification report |

### AI Resume Toolkit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume-toolkit/find-jobs` | Infer role from resume, search Jooble |
| `POST` | `/api/resume-toolkit/optimize-keywords` | ATS keyword rewriting via LLM |
| `POST` | `/api/resume-toolkit/find-hiring-manager` | Apollo.io lookup (paid) → people/match (free) → pattern fallback |
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
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **3D Graph** | react-force-graph-3d, Three.js |
| **Charts** | Recharts |
| **Backend** | Python 3.11+, FastAPI, Pydantic v2 |
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
1. **Parser** — Extracts structured technical claims from resume PDF using Gemini
2. **Auditor** — Queries the Neo4j knowledge graph using topic-synonym expansion
3. **Grader** — Scores each claim 0–100 using evidence count, cyclomatic complexity alignment, and LLM reasoning

Results stream back to the frontend via **Server-Sent Events (SSE)**.

> **LLM note:** All AI calls go through **Groq (Llama 3.3 70B)** via `langchain_groq`, chosen for its speed and generous free tier. The `GOOGLE_API_KEY` in `.env.example` is legacy — only `GROQ_API_KEY` is required.

### Ingestion Engine
- Shallow-clones GitHub repos (depth=1, LFS-safe)
- Parses **6 languages**: Python, JavaScript, TypeScript, Go, Java, Rust via tree-sitter
- Extracts `File`, `Class`, `Function`, `Import` nodes + relationships into Neo4j AuraDB
- Computes **cyclomatic complexity** for every function

### 3D Knowledge Graph (Smart Sampling)
The `/api/graph/{repo_id}` endpoint supports large repositories without capping at 1000 nodes:
- **Default limit**: 5,000 nodes (configurable up to 25,000 via `?limit=N`)
- **Sampling priority**: Files → Classes → Functions (top complexity first) → Imports
- **Multi-repo**: Pass comma-separated IDs (`/api/graph/repo1,repo2`) for a combined view
- **Server-side edge filtering**: Only edges between sampled nodes are returned — prevents rendering crashes
- **UI banner**: Graph shows a "Showing X of Y nodes (sampled by complexity)" indicator when sampling is active

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

### Skills Verification Section
The dashboard Skills tab is a premium credential report panel:
- **Sorted display:** Verified → Partially Verified → Unverified, then score descending
- **Filter toolbar:** Instant search by skill name, status dropdown, Expand All / Collapse All, live results count
- **Animated score bar:** Fills 0→score on mount, color-coded green/amber/red
- **Parsed evidence nodes:** `path/file.py:function_name` rendered as `📄 file.py → function_name` with file-type badges (PY/TS/JS)
- **Sectioned card layout:** AI Reasoning / Complexity Analysis / Code Evidence / Interview Prep
- **AI Interview Prep:** 5 personalised questions per skill with per-question collapsible hints and Copy All button
- **Unverified skills:** Friendly actionable message instead of raw error text

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
- Shows gap analysis cards (Areas to Improve / Above Benchmark) and summary pills

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

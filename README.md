# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

A multi-agent system that cross-references PDF resume claims against actual GitHub repository code analysis — using cyclomatic complexity scoring, coding stylometry, and a Neo4j knowledge graph.

---

## Project Structure

```
trueskill-ai/
├── backend/                         # FastAPI Python backend
│   ├── app/
│   │   ├── api.py                   # All API routes (18+ endpoints)
│   │   ├── agents.py                # LangGraph verification workflow (Parser → Auditor → Grader)
│   │   ├── ingest.py                # GitHub repo cloning & AST parsing (6 languages)
│   │   ├── forensics.py             # Stylometric authorship analysis
│   │   ├── ats.py                   # ATS resume scoring & HTML report
│   │   ├── coach.py                 # Gap analysis & bridge project generator
│   │   ├── job_finder.py            # Jooble job search & Apollo.io hiring manager lookup
│   │   ├── resume_optimizer.py      # LLM-driven keyword rewriting & email drafting
│   │   ├── report.py                # HTML verification report generator
│   │   ├── storage.py               # SQLite persistence for saved analyses
│   │   ├── db.py                    # Neo4j driver & query helpers
│   │   └── llm.py                   # Shared LLM client (Gemini 2.5 Flash)
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
│       │   └── resume-toolkit/      # 4-step AI Resume Toolkit
│       └── components/
│           ├── GraphVisualizer.tsx  # 3D force-graph (react-force-graph-3d)
│           ├── ATSScorePanel.tsx    # ATS evaluation results panel
│           ├── SkillCard.tsx        # Per-claim verification card
│           ├── ResumeOptimizer.tsx  # ATS keyword rewriting UI
│           ├── EmailComposer.tsx    # Personalized outreach email UI
│           ├── JobCard.tsx          # Job posting card
│           ├── SkillTimeline.tsx    # Language timeline chart
│           ├── GraphFullscreenModal.tsx
│           ├── Navbar.tsx           # Scroll-aware shared navbar
│           ├── Skeletons.tsx        # Loading skeletons
│           └── AnimatedCounter.tsx
├── docker-compose.yml               # Neo4j + Backend + Frontend
├── start_all.py                     # One-command dev stack launcher
└── README.md
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose (for Neo4j)
- Node.js 20+ (for frontend)
- Python 3.11+ (for backend)

### Option 1 — One-Command Launch (Recommended)

```bash
python start_all.py
```

This script automatically:
1. Starts Neo4j via Docker Compose
2. Creates a Python virtualenv and installs backend deps
3. Starts FastAPI with hot-reload on `:8000`
4. Starts Next.js dev server on `:3000`

Press `Ctrl+C` to stop all services gracefully.

### Option 2 — Manual

**Start Database:**
```bash
docker compose up neo4j -d
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GOOGLE_API_KEY, etc.
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
| Neo4j Browser | http://localhost:7474 |

Neo4j credentials: `neo4j / trueskill_password`

---

## API Endpoints

### Core Verification Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Clone GitHub repo & build Neo4j knowledge graph |
| `POST` | `/api/extract-profile` | Extract GitHub username from PDF + fetch repo list |
| `POST` | `/api/analyze` | Run agent workflow (SSE streaming response) |
| `GET`  | `/api/graph/{repo_id}` | Return nodes & edges for 3D graph visualization |
| `GET`  | `/api/skill-timeline/{repo_id}` | File timeline grouped by language |
| `GET`  | `/api/forensics/{repo_id}` | Authorship & stylometry data |

### Saved Analyses & Comparison
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyses` | Save an analysis result |
| `GET`  | `/api/analyses` | List all saved analyses |
| `GET`  | `/api/analyses/{id}` | Get a specific saved analysis |
| `GET`  | `/api/compare?ids=...` | Compare multiple analyses |

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
| `POST` | `/api/resume-toolkit/find-hiring-manager` | Apollo.io hiring manager lookup |
| `POST` | `/api/resume-toolkit/draft-email` | Draft personalized outreach email |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Application health check |
| `GET` | `/api/health/db` | Neo4j connectivity check |

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
| **Graph Database** | Neo4j (Docker or AuraDB) |
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
- Extracts `File`, `Class`, `Function`, `Import` nodes + relationships into Neo4j
- Computes **cyclomatic complexity** for every function

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
3. **Hiring Manager Lookup** — Apollo.io search → email pattern inference
4. **Outreach Email** — LLM drafts a personalized cold email for the role

### Candidate Comparison
The `/compare` page loads two or more saved analyses side-by-side for HR-style screening.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=trueskill_password

# Groq (required — powers all LLM calls)
GROQ_API_KEY=your_groq_api_key_here

# GitHub Token (optional — avoids rate limits on repo fetch)
GITHUB_TOKEN=your_github_token_here

# Optional integrations
JOOBLE_API_KEY=your_jooble_key
APOLLO_API_KEY=your_apollo_key
```

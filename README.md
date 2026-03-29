# TrueSkill AI

Automated Competency Verification System using GraphRAG (Graph-based Retrieval Augmented Generation).

## Project Structure

```
trueskill-ai/
├── backend/                 # FastAPI Python backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── api.py          # API routes
│   │   └── db.py           # Neo4j database connection
│   ├── main.py             # FastAPI entry point
│   ├── requirements.txt    # Python dependencies
│   ├── Dockerfile
│   └── .env.example
├── frontend/               # Next.js 14 frontend
│   ├── src/
│   │   └── app/           # App Router pages
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml      # Container orchestration
└── README.md
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for frontend development)
- Python 3.11+ (for backend development)

### Start Services with Docker

```bash
# Start Neo4j database only
docker-compose up neo4j -d

# Or start all services
docker-compose up -d
```

### Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Access Points
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Neo4j Browser:** http://localhost:7474 (user: neo4j, password: trueskill_password)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest` | Ingest a GitHub repository |
| POST | `/api/analyze` | Analyze resume against repo |
| GET | `/api/graph/{repo_id}` | Get graph data for visualization |
| GET | `/health` | Health check |
| GET | `/api/health/db` | Database connectivity check |

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Python 3.11+, FastAPI, Pydantic
- **Database:** Neo4j (Graph DB)
- **AI:** LangChain, LangGraph, Gemini 2.5 Flash

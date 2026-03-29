# PROJECT SPECIFICATION: TrueSkill AI (MSc Thesis)

## 1. Project Overview
**Title:** TrueSkill AI: Automated Competency Verification System
**Type:** Master's Thesis Final Project (6 Months)
**Core Value:** A Multi-Agent System that verifies claims on a PDF Resume by cross-referencing them with actual code analysis from a GitHub Repository using GraphRAG (Graph-based Retrieval Augmented Generation).

## 2. Technical Architecture

### 2.1 Tech Stack
* **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI, React-Force-Graph-3D.
* **Backend:** Python 3.11+, FastAPI, Pydantic.
* **Database:** * **Graph DB:** Neo4j (AuraDB Free Tier or Local Docker) - Stores Code Structure.
    * **Relational DB:** Supabase or SQLite (Local dev) - Stores User Auth & Report Logs.
    * **Vector DB:** ChromaDB (Optional, for hybrid search).
* **AI Orchestration:** LangChain, LangGraph.
* **AI Models:**
    * **Context/Parsing:** Gemini 2.5 Flash (via Google AI Studio API).
    * **Reasoning/Logic:** DeepSeek-R1 (via Groq/Ollama) or Llama-3.

### 2.2 System Modules
1.  **Ingestion Engine:** Clones GitHub repos, parses code using `tree-sitter`, and builds a Knowledge Graph.
2.  **Reasoning Core:** A "Council of Agents" that validates extracted resume claims against the graph.
3.  **Visualization Layer:** A Next.js dashboard showing the resume vs. evidence and a 3D graph view.
4.  **Coach Module:** Generates "Bridge Projects" for unverified skills.

## 3. Data Models (Strict Schema)

### 3.1 Graph Database Schema (Neo4j)
* **Nodes:**
    * `(:File {name, path, language})`
    * `(:Class {name, line_start, line_end})`
    * `(:Function {name, args, complexity_score})`
    * `(:Import {module_name})`
* **Relationships:**
    * `(:Function)-[:CALLS]->(:Function)`
    * `(:Class)-[:INHERITS_FROM]->(:Class)`
    * `(:File)-[:CONTAINS]->(:Class|:Function)`
    * `(:File)-[:IMPORTS]->(:Import)`

### 3.2 Domain Objects (Pydantic)
* **ResumeClaim:** `{ topic: str, claim_text: str, confidence_required: int }`
* **VerificationResult:** `{ claim_id: str, status: "Verified"|"Unverified", evidence_node_ids: List[str], reasoning: str }`

## 4. Agent Workflows (LangGraph)

### Workflow 1: The Verification Loop
1.  **Node A (Parser):** Input PDF -> Output `List[ResumeClaim]`.
2.  **Node B (Auditor):** Input `ResumeClaim` -> Action `query_graph(cypher)` -> Output `GraphContext`.
3.  **Node C (Grader):** Input `Claim + GraphContext` -> Output `VerificationResult` (0-100 Score).

### Workflow 2: The Gap Analyzer
1.  **Input:** `VerifiedSkills` list vs `JobDescription` text.
2.  **Logic:** Identify missing keywords + Identify "weak" verifications (Score < 50).
3.  **Output:** `ProjectSuggestion` (Title, Tech Stack, Step-by-Step Instructions).

## 5. API Contract (FastAPI)

* `POST /api/ingest`: Accepts `{ github_url }`. Triggers cloning & graph building.
* `POST /api/analyze`: Accepts `{ pdf_file, repo_id }`. Triggers the Agent Workflow. Returns JSON Report.
* `GET /api/graph/{repo_id}`: Returns Nodes/Edges for frontend visualization.

## 6. Thesis-Specific Requirements (Non-Negotiable)
1.  **Cyclomatic Complexity:** The "Grader" agent must not just check for existence of code. It must check *complexity*. A "Hello World" function does not verify "Python Expert".
2.  **Stylometry:** The backend must analyze variable naming consistency (snake_case vs camelCase) to detect AI-generated code.
3.  **Explainability:** Every verification must return `evidence_node_ids` so the frontend can highlight the exact code block responsible for the decision.
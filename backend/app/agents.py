"""
Reasoning Core - Multi-Agent Verification System
Implements the Verification Loop workflow using LangGraph.

Workflow (from project_spec.md):
    Node A (Parser): Input PDF -> Output List[ResumeClaim]
    Node B (Auditor): Input ResumeClaim -> Action query_graph(cypher) -> Output GraphContext  
    Node C (Grader): Input Claim + GraphContext -> Output VerificationResult (0-100 Score)
"""

import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Any, TypedDict, Optional, Union
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

from .db import query_graph
from .llm import get_llm_model, parse_json_response
from .alias_map import LIBRARY_ALIAS_MAP

# ── Concurrency controls ──────────────────────────────────────────────────────
# Thread pool for running synchronous Neo4j calls concurrently inside async fns
_DB_EXECUTOR = ThreadPoolExecutor(max_workers=12, thread_name_prefix="trueskill_db")

# Semaphore: max concurrent Groq LLM calls (primary + backup key → 8 is safe)
_GRADER_SEM = asyncio.Semaphore(8)


# =============================================================================
# Pydantic Models (from project_spec.md)
# =============================================================================

class ResumeClaim(BaseModel):
    """A single claim extracted from a resume"""
    topic: str = Field(description="The skill or technology category (e.g., 'Python', 'Machine Learning')")
    claim_text: str = Field(description="The exact claim made in the resume")
    difficulty: int = Field(description="Difficulty level 1-5, where 5 is expert level", ge=1, le=5)
    specific_libraries: list[str] = Field(default_factory=list, description="Exact library/package import names mentioned (e.g., ['torch', 'cv2', 'sklearn'])")


class GraphEvidence(BaseModel):
    """Evidence retrieved from the knowledge graph"""
    node_ids: list[str] = Field(default_factory=list, description="IDs of nodes that support/refute the claim")
    node_types: list[str] = Field(default_factory=list, description="Types of nodes found")
    code_snippets: list[str] = Field(default_factory=list, description="Relevant code patterns found")
    complexity_scores: list[int] = Field(default_factory=list, description="Cyclomatic complexity of related functions")
    cypher_query: str = Field(default="", description="The Cypher query that was executed")
    raw_results: list[dict] = Field(default_factory=list, description="Raw query results")


class VerificationResult(BaseModel):
    """Result of verifying a single claim"""
    claim_id: str = Field(description="Unique identifier for the claim")
    topic: str = Field(description="The skill topic being verified")
    claim_text: str = Field(description="Original claim text")
    status: str = Field(description="Verified, Partially Verified, or Unverified")
    score: int = Field(description="Confidence score 0-100", ge=0, le=100)
    evidence_node_ids: list[str] = Field(default_factory=list, description="Node IDs that support the claim")
    reasoning: str = Field(description="Explanation of the verification decision")
    complexity_analysis: str = Field(default="", description="Analysis of code complexity if applicable")
    score_breakdown: dict = Field(
        default_factory=dict,
        description="Sub-scores: evidence_base, node_bonus, complexity, llm"
    )


# =============================================================================
# LangGraph State
# =============================================================================

class VerificationState(TypedDict):
    """State passed between nodes in the verification workflow"""
    # Input
    resume_text: str
    repo_id: str          # primary repo_id (kept for backwards compat)
    repo_ids: list[str]   # ALL repo_ids to analyze against (routing uses this)

    # After Parser
    claims: list[dict]

    # After Auditor (evidence per claim)
    evidence_map: dict[str, dict]  # claim_id -> evidence

    # After Grader
    results: list[dict]

    # Error tracking
    errors: list[str]


# LLM is initialized via shared llm.py module


# =============================================================================
# Synonym / Keyword Mapping for Smarter Claim Matching (Improvement #6)
# =============================================================================

TOPIC_SYNONYMS: dict[str, list[str]] = {
    "machine learning": ["sklearn", "tensorflow", "keras", "pytorch", "torch", "train", "predict", "model", "classifier", "regression", "xgboost", "lightgbm", "fit", "transform"],
    "deep learning": ["neural", "cnn", "rnn", "lstm", "transformer", "attention", "layer", "activation", "backpropagation", "pytorch", "tensorflow", "keras"],
    "natural language processing": ["nlp", "tokenize", "embedding", "bert", "gpt", "spacy", "nltk", "text", "corpus", "sentiment", "ner"],
    "computer vision": ["opencv", "cv2", "image", "detection", "segmentation", "yolo", "resnet", "convolution", "pillow", "pil"],
    "data science": ["pandas", "numpy", "matplotlib", "seaborn", "scipy", "analysis", "visualization", "dataframe", "jupyter"],
    "web development": ["flask", "django", "fastapi", "express", "react", "vue", "angular", "html", "css", "http", "router", "middleware"],
    "api": ["rest", "graphql", "endpoint", "request", "response", "router", "middleware", "fastapi", "flask", "express", "http", "fetch"],
    "database": ["sql", "nosql", "postgres", "mysql", "mongodb", "neo4j", "redis", "supabase", "query", "schema", "migration", "orm"],
    "testing": ["pytest", "unittest", "jest", "mocha", "test", "assert", "mock", "fixture", "coverage"],
    "devops": ["docker", "kubernetes", "k8s", "ci", "cd", "pipeline", "deploy", "terraform", "ansible", "github_actions"],
    "cloud": ["aws", "gcp", "azure", "lambda", "s3", "ec2", "cloud_run", "cloud_function", "vertex"],
    "data engineering": ["etl", "pipeline", "airflow", "spark", "kafka", "stream", "batch", "data_lake", "warehouse"],
    "authentication": ["auth", "jwt", "oauth", "token", "session", "login", "password", "bcrypt", "security"],
    "frontend": ["react", "vue", "angular", "next", "nuxt", "svelte", "component", "state", "hook", "redux", "tailwind"],
    "backend": ["server", "api", "middleware", "controller", "service", "handler", "route", "endpoint"],
    # Modern AI / LLM terms (Issue #20)
    "llm": ["language model", "openai", "anthropic", "claude", "gemini", "llama", "mistral", "completion", "prompt", "token", "chat", "generation"],
    "langchain": ["chain", "agent", "retriever", "langchain", "langgraph", "tool", "memory", "runnable"],
    "rag": ["retrieval", "vectorstore", "chunk", "similarity", "pinecone", "faiss", "chroma", "weaviate", "qdrant", "context", "augmented"],
    "vector database": ["faiss", "pinecone", "chroma", "weaviate", "qdrant", "embedding", "similarity", "index", "upsert", "query_vector"],
    "transformer": ["attention", "bert", "gpt", "t5", "roberta", "encoder", "decoder", "huggingface", "transformers", "tokenizer"],
    "reinforcement learning": ["reward", "policy", "gym", "q_learning", "ppo", "dqn", "episode", "agent", "environment", "action", "state"],
    "generative ai": ["generate", "diffusion", "stable_diffusion", "gan", "vae", "latent", "sampling", "dalle", "midjourney"],
}


def _expand_topic_keywords(topic: str, specific_libraries: Optional[list[str]] = None) -> list[str]:
    """
    Expand a topic into a list of related keywords for broader Cypher matching.
    Fix 1: checks LIBRARY_ALIAS_MAP first so 'PyTorch' finds 'torch' imports.
    Fix 6: merges in specific_libraries extracted by the parser.
    """
    topic_lower = topic.lower().strip()
    keywords: list[str] = [topic_lower]

    # Fix 1 — alias map: marketing name → actual import package names
    for alias_key, alias_packages in LIBRARY_ALIAS_MAP.items():
        if topic_lower == alias_key or topic_lower in alias_key or alias_key in topic_lower:
            keywords.extend(alias_packages)

    # Existing synonym expansion
    for group_key, synonyms in TOPIC_SYNONYMS.items():
        if (topic_lower in group_key
                or group_key in topic_lower
                or any(syn in topic_lower for syn in synonyms)):
            keywords.extend(synonyms)

    # Fix 6 — specific libraries extracted by the parser LLM
    if specific_libraries:
        for lib in specific_libraries:
            lib_lower = lib.lower().strip()
            if lib_lower and lib_lower not in keywords:
                keywords.append(lib_lower)
                # Also look up aliases for each specific library
                for alias_key, alias_packages in LIBRARY_ALIAS_MAP.items():
                    if lib_lower == alias_key or alias_key in lib_lower:
                        keywords.extend(p for p in alias_packages if p not in keywords)

    # Token split for multi-word topics
    for word in topic_lower.split():
        if word not in keywords and len(word) > 2:
            keywords.append(word)

    return list(set(keywords))


# =============================================================================
# Repo Profile & Claim Routing (Layer 2 of scoped verification)
# =============================================================================

_LANG_HINTS: dict[str, set[str]] = {
    "python":          {"python"},
    "javascript":      {"javascript", "js", "typescript"},
    "typescript":      {"typescript", "javascript"},
    "java":            {"java"},
    "go":              {"go"},
    "golang":          {"go"},
    "rust":            {"rust"},
    "react":           {"javascript", "typescript"},
    "vue":             {"javascript", "typescript"},
    "angular":         {"typescript"},
    "next.js":         {"javascript", "typescript"},
    "node":            {"javascript", "typescript"},
    "flask":           {"python"},
    "django":          {"python"},
    "fastapi":         {"python"},
    "machine learning":{"python"},
    "deep learning":   {"python"},
    "data science":    {"python"},
    "pytorch":         {"python"},
    "tensorflow":      {"python"},
    "sklearn":         {"python"},
    "kubernetes":      {"yaml", "go"},
    "docker":          {"yaml"},
    "sql":             {"sql", "python", "java"},
}


def _fetch_one_repo_profile(repo_id: str) -> tuple[str, dict]:
    """Fetch language/import/name profile for ONE repo — runs in thread pool."""
    try:
        # Single combined query: 1 round-trip instead of 3
        combined = query_graph(
            """
            MATCH (n) WHERE n.repo_id = $rid
            WITH n
            RETURN
              CASE WHEN n:File AND n.language IS NOT NULL THEN 'lang:' + toLower(n.language) END AS lang_tag,
              CASE WHEN n:Import THEN 'imp:' + toLower(n.module_name) END AS imp_tag,
              CASE WHEN (n:Function OR n:Class) AND n.name IS NOT NULL THEN 'nm:' + toLower(n.name) END AS nm_tag
            LIMIT 200
            """,
            {"rid": repo_id}
        )
        languages: set[str] = set()
        imports: set[str] = set()
        names: set[str] = set()
        for r in combined:
            if r.get("lang_tag"):
                languages.add(r["lang_tag"][5:])  # strip 'lang:'
            if r.get("imp_tag"):
                imports.add(r["imp_tag"][4:])     # strip 'imp:'
            if r.get("nm_tag"):
                names.add(r["nm_tag"][3:])        # strip 'nm:'
        return repo_id, {"languages": languages, "imports": imports, "names": names}
    except Exception:
        return repo_id, {"languages": set(), "imports": set(), "names": set()}


def build_repo_profile_map(repo_ids: list[str]) -> dict[str, dict]:
    """
    Query Neo4j for each repo's language and import profile.
    Sync version — used from sync callers (project_verifier).
    """
    import concurrent.futures
    if len(repo_ids) <= 1:
        return dict([_fetch_one_repo_profile(rid) for rid in repo_ids])
    with ThreadPoolExecutor(max_workers=min(len(repo_ids), 8)) as ex:
        return dict(ex.map(_fetch_one_repo_profile, repo_ids))


async def build_repo_profile_map_async(repo_ids: list[str]) -> dict[str, dict]:
    """
    Async version — fetches all repo profiles concurrently in the DB thread pool.
    Used from graph_auditor_node.
    """
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(_DB_EXECUTOR, _fetch_one_repo_profile, rid)
        for rid in repo_ids
    ]
    results = await asyncio.gather(*tasks)
    return dict(results)


def route_claim_to_repos(
    claim_dict: dict,
    repo_profile_map: dict[str, dict],
) -> tuple[list[str], bool]:
    """
    Return (repo_ids_to_search, was_fallback).
    was_fallback=True means no repo matched and we fell back to ALL repos.
    """
    if not repo_profile_map:
        return [], True

    topic = claim_dict.get("topic", "").lower()
    keywords = set(_expand_topic_keywords(topic))

    lang_hints: set[str] = set()
    for key, langs in _LANG_HINTS.items():
        if key in topic or topic in key:
            lang_hints.update(langs)

    scored: list[tuple[str, int]] = []
    for repo_id, profile in repo_profile_map.items():
        languages = profile.get("languages", set())
        imports   = profile.get("imports", set())
        names     = profile.get("names", set())
        score = 0

        if lang_hints and (languages & lang_hints):
            score += 4

        for kw in keywords:
            if len(kw) >= 3 and any(kw in imp or imp.startswith(kw) for imp in imports):
                score += 2
                break

        for kw in keywords:
            if len(kw) >= 4 and any(kw in nm for nm in names):
                score += 1
                break

        scored.append((repo_id, score))

    relevant = [(rid, s) for rid, s in scored if s > 0]
    if not relevant:
        # Fallback: search ALL repos (per user decision)
        return list(repo_profile_map.keys()), True

    max_score = max(s for _, s in relevant)
    return [rid for rid, s in relevant if s >= max(1, max_score // 2)], False


def generate_cypher_for_claim(claim: ResumeClaim, repo_ids: list[str]) -> str:
    """
    Generate a Cypher query to find evidence for a claim.
    Fix 2: searches first 8000 chars of source_code (was 1500) and docstrings.
    Fix 2: LIMIT raised to 100 (was 50).
    Fix 3: source_preview raised to 2000 chars for richer LLM context.
    """
    query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids
      AND ANY(kw IN $keywords WHERE
        toLower(n.name) CONTAINS kw
        OR (n:Import AND toLower(n.module_name) CONTAINS kw)
        OR (n:Function AND n.source_code IS NOT NULL
            AND toLower(substring(n.source_code, 0, 8000)) CONTAINS kw)
        OR (n:Function AND n.docstring IS NOT NULL
            AND toLower(n.docstring) CONTAINS kw)
        OR (n.file_path IS NOT NULL AND toLower(n.file_path) CONTAINS kw)
      )
    WITH n, labels(n) AS node_labels
    OPTIONAL MATCH (n)-[:CALLS]->(called:Function)
    WHERE n:Function
    RETURN
        n,
        node_labels,
        n.complexity_score AS complexity,
        collect(DISTINCT called.name) AS calls_functions,
        CASE WHEN (n:Function OR n:Class) AND n.source_code IS NOT NULL
             THEN substring(n.source_code, 0, 2000)
             ELSE null END AS source_preview
    LIMIT 100
    """
    return query


def _rank_evidence_key(record: dict) -> tuple:
    """Fix 4: Sort evidence so complex functions appear before classes before imports."""
    labels = record.get("node_labels", [])
    complexity = record.get("complexity") or 0
    if "Function" in labels:
        return (0, -complexity)   # highest-complexity functions first
    elif "Class" in labels:
        return (1, 0)
    else:  # Import
        return (2, 0)


def query_knowledge_graph(
    claim: ResumeClaim,
    repo_ids: list[str],
) -> GraphEvidence:
    """
    Query the Neo4j knowledge graph to find evidence for a claim.
    Fix 1+6: uses alias map + specific_libraries for keyword expansion.
    Fix 4: re-ranks results (functions > classes > imports) before returning.
    """
    keywords = _expand_topic_keywords(claim.topic, claim.specific_libraries)

    cypher_query = generate_cypher_for_claim(claim, repo_ids)
    try:
        results = query_graph(cypher_query, {
            "repo_ids": repo_ids,
            "keywords": keywords,
        })
    except Exception as e:
        return GraphEvidence(
            cypher_query=cypher_query,
            raw_results=[{"error": str(e)}]
        )

    # Fix 4: re-rank so best evidence reaches the LLM first
    results.sort(key=_rank_evidence_key)
    
    # Parse results into evidence
    node_ids = []
    node_types = []
    code_snippets = []  # Now includes source previews for richer LLM context
    complexity_scores = []

    for record in results:
        node = record.get("n", {})
        labels = record.get("node_labels", [])
        complexity = record.get("complexity")
        source_preview = record.get("source_preview") or ""

        # Extract node ID (using name + file_path as composite ID)
        node_name = node.get("name", node.get("module_name", "unknown"))
        file_path = node.get("file_path", node.get("path", ""))
        node_id = f"{file_path}:{node_name}" if file_path else node_name

        node_ids.append(node_id)
        node_types.extend(labels)

        if complexity is not None:
            complexity_scores.append(complexity)

        # Build rich snippet: signature + first 300 chars of body
        if "Function" in labels:
            args = node.get("args", [])
            sig = f"def {node_name}({', '.join(args)})"
            body = source_preview[:300].strip() if source_preview else ""
            snippet = f"{sig}\n{body}" if body else sig
            code_snippets.append(snippet)
        elif "Class" in labels:
            body = source_preview[:200].strip() if source_preview else ""
            snippet = f"class {node_name}\n{body}" if body else f"class {node_name}"
            code_snippets.append(snippet)
        elif "Import" in labels:
            snippet = f"import {node.get('module_name', node_name)}"
            code_snippets.append(snippet)
    
    return GraphEvidence(
        node_ids=node_ids,
        node_types=list(set(node_types)),
        code_snippets=code_snippets,
        complexity_scores=complexity_scores,
        cypher_query=cypher_query,
        raw_results=results
    )


# =============================================================================
# Node A: Resume Parser
# =============================================================================

async def resume_parser_node(state: VerificationState) -> VerificationState:
    """
    Parse resume text into structured claims using Gemini.
    
    Input: resume_text (raw PDF text)
    Output: claims (list of ResumeClaim objects)
    """
    resume_text = state["resume_text"]
    
    llm = get_llm_model(temperature=0.1)
    
    system_prompt = """You are an expert resume analyzer. Extract ALL specific, verifiable claims from this resume.

For each claim, provide ALL FIVE fields:
1. **topic**: The skill/technology category (e.g., "PyTorch", "Computer Vision", "FastAPI")
2. **claim_text**: The exact claim from the resume
3. **difficulty**: Claimed expertise level 1-5 (1=basic, 5=expert/architect)
4. **claim_type**: EXACTLY one of:
   - "code_verifiable" — skill uses a specific library, framework, or API visible in source code
   - "not_code_verifiable" — soft skill, methodology, or concept not in code (Agile, leadership, communication, etc.)
5. **specific_libraries**: List of exact Python/JS import names that would prove this claim in code.
   Examples: PyTorch → ["torch"], OpenCV → ["cv2"], scikit-learn → ["sklearn"],
   HuggingFace → ["transformers"], PySpark → ["pyspark"], Streamlit → ["streamlit"].
   Leave empty [] if not_code_verifiable or if no specific import name is known.

IMPORTANT RULES:
- Extract ONE claim per distinct technology/skill (keep highest difficulty if duplicated)
- Maximum 20 claims total
- For specific_libraries, use the ACTUAL Python import name, not the marketing name

Return ONLY valid JSON:
{
  "claims": [
    {"topic": "...", "claim_text": "...", "difficulty": 3, "claim_type": "code_verifiable", "specific_libraries": ["torch"]},
    ...
  ]
}"""

    human_prompt = f"""Extract all verifiable technical claims from this resume:

---
{resume_text}
---

Return the claims as JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])

        parsed = parse_json_response(response.content)
        raw_claims = parsed.get("claims", [])

        # Dedup by topic: keep highest-difficulty claim per unique topic
        seen: dict[str, dict] = {}
        for claim in raw_claims:
            key = claim.get("topic", "").lower().strip()
            if not key:
                continue
            existing = seen.get(key)
            if existing is None or claim.get("difficulty", 0) > existing.get("difficulty", 0):
                seen[key] = claim

        claims = list(seen.values())[:20]  # hard cap at 20

        # Add unique IDs — 8-char prefix to match UUID generation in clone_repo
        repo_prefix = state["repo_id"][:8] if state.get("repo_id") else "repo"
        for i, claim in enumerate(claims):
            claim["id"] = f"{repo_prefix}_{i}"

        state["claims"] = claims

    except Exception as e:
        state["errors"].append(f"Parser error: {str(e)}")
        state["claims"] = []

    return state


# =============================================================================
# Node B: Graph Auditor
# =============================================================================

async def graph_auditor_node(state: VerificationState) -> VerificationState:
    """
    Query the knowledge graph for evidence supporting each claim.
    Opt 8: all Neo4j evidence queries run concurrently in the DB thread pool.
    """
    claims = state["claims"]
    repo_ids = state.get("repo_ids") or [state["repo_id"]]
    loop = asyncio.get_event_loop()

    # Build repo profile map concurrently (Opt 3)
    repo_profile_map = await build_repo_profile_map_async(repo_ids)

    async def _fetch_evidence(claim_dict: dict) -> tuple[str, dict]:
        claim_id = claim_dict.get("id", f"claim_{claims.index(claim_dict)}")

        # Layer 1 — skip not-code-verifiable claims immediately
        if claim_dict.get("claim_type") == "not_code_verifiable":
            claim_dict["skip_reason"] = "not_code_verifiable"
            return claim_id, GraphEvidence().model_dump()

        # Layer 2 — route claim to relevant repos
        target_repos, was_fallback = route_claim_to_repos(claim_dict, repo_profile_map)
        if not target_repos:
            target_repos = repo_ids
            was_fallback = True

        valid_fields = {k for k in ResumeClaim.model_fields}
        claim = ResumeClaim(**{k: v for k, v in claim_dict.items() if k in valid_fields})

        try:
            # Run sync Neo4j query in thread pool so all claims fire concurrently
            evidence = await loop.run_in_executor(
                _DB_EXECUTOR, query_knowledge_graph, claim, target_repos
            )
            if was_fallback and not evidence.node_ids:
                claim_dict["skip_reason"] = "repo_not_available"
            return claim_id, evidence.model_dump()
        except Exception as e:
            state["errors"].append(f"Auditor error for {claim_id}: {str(e)}")
            return claim_id, GraphEvidence().model_dump()

    # Fire all evidence fetches concurrently
    pairs = await asyncio.gather(*[_fetch_evidence(c) for c in claims])
    state["evidence_map"] = dict(pairs)
    return state


# =============================================================================
# Node C: Grader
# =============================================================================

async def _grade_one_claim(
    i: int,
    claim_dict: dict,
    evidence_dict: dict,
    llm: Any,
    semaphore: asyncio.Semaphore,
) -> dict:
    """
    Grade a single claim. Runs concurrently for all claims via asyncio.gather.
    Scoring logic is 100% identical to the old sequential version.
    """
    # ── Handle skipped claims (no LLM needed) ────────────────────────────────
    skip_reason = claim_dict.get("skip_reason")
    if skip_reason == "not_code_verifiable":
        return VerificationResult(
            claim_id=claim_dict.get("id", f"claim_{i}"),
            topic=claim_dict.get("topic", ""),
            claim_text=claim_dict.get("claim_text", ""),
            status="Not Code-Verifiable",
            score=0,
            evidence_node_ids=[],
            reasoning="This claim describes a methodology, soft skill, or domain concept that does not manifest directly in source code and cannot be verified via code analysis.",
            complexity_analysis="",
            score_breakdown={},
        ).model_dump()

    if skip_reason == "repo_not_available":
        return VerificationResult(
            claim_id=claim_dict.get("id", f"claim_{i}"),
            topic=claim_dict.get("topic", ""),
            claim_text=claim_dict.get("claim_text", ""),
            status="Repo Not Available",
            score=0,
            evidence_node_ids=[],
            reasoning="No ingested repository covers this technology area. Ingest a relevant repository to verify this claim.",
            complexity_analysis="",
            score_breakdown={},
        ).model_dump()

    claim_id = claim_dict.get("id", f"claim_{i}")
    evidence = GraphEvidence(**evidence_dict) if evidence_dict else GraphEvidence()

    # ── Evidence base score ───────────────────────────────────────────────────
    has_functions = any(t == "Function" for t in evidence.node_types)
    has_classes   = any(t == "Class"    for t in evidence.node_types)
    has_imports   = any(t == "Import"   for t in evidence.node_types)

    if has_functions or has_classes:
        evidence_base = 30
    elif has_imports:
        evidence_base = 15
    else:
        evidence_base = 0

    # ── Node count bonus (capped at 10) ───────────────────────────────────────
    node_bonus = min(len(evidence.node_ids) * 2, 10) if evidence.node_ids else 0

    # ── Depth bonus ───────────────────────────────────────────────────────────
    depth_bonus = 0
    complexity_analysis = ""
    function_node_count = sum(1 for r in evidence.raw_results if "Function" in r.get("node_labels", []))
    import_node_count   = sum(1 for r in evidence.raw_results if "Import"   in r.get("node_labels", []))

    if function_node_count >= 5:
        depth_bonus += 10
    elif function_node_count >= 2:
        depth_bonus += 5

    if import_node_count >= 3:
        depth_bonus += 5
    elif import_node_count >= 1:
        depth_bonus += 2

    if evidence.complexity_scores:
        avg_complexity = sum(evidence.complexity_scores) / len(evidence.complexity_scores)
        max_complexity = max(evidence.complexity_scores)
        if max_complexity >= 5 or avg_complexity >= 3:
            depth_bonus += 5
            complexity_analysis = (
                f"Non-trivial implementation detected "
                f"(avg complexity: {avg_complexity:.1f}, max: {max_complexity})."
            )
        else:
            complexity_analysis = (
                f"Implementation found but appears straightforward "
                f"(avg complexity: {avg_complexity:.1f})."
            )

    base_score = evidence_base + node_bonus + depth_bonus

    # ── LLM semantic analysis (0-40 pts) — guarded by semaphore ─────────────
    llm_score = 0
    reasoning = ""

    if evidence.node_ids:
        async with semaphore:
            try:
                snippet_parts = []
                for raw_result in evidence.raw_results[:6]:
                    node = raw_result.get("n", {})
                    node_labels = raw_result.get("node_labels", [])
                    source_preview = raw_result.get("source_preview") or ""
                    node_name = node.get("name", node.get("module_name", ""))
                    file_path = node.get("file_path", node.get("path", ""))
                    label = node_labels[0] if node_labels else "Node"
                    body = source_preview[:2000].strip() if source_preview else "(no source available)"
                    snippet_parts.append(f"[{label}] {file_path}:{node_name}\n{body}")

                evidence_summary = "\n\n---\n\n".join(snippet_parts) if snippet_parts else \
                    f"Evidence nodes found: {', '.join(evidence.node_ids[:10])}"

                analysis_prompt = f"""You are a senior engineering interviewer verifying a resume claim against actual code evidence.

SCORING CALIBRATION:
- 32-40: Direct, non-trivial implementation. Library imported AND meaningfully used in functions.
- 15-31: Partial — library imported or framework present, but implementation depth is unclear.
- 5-14:  Weak — keyword appears in file/function names only; no real implementation visible.
- 0-4:   None — code is unrelated or only superficially matches.

CLAIM TO VERIFY:
  Topic: {claim_dict.get('topic', '')}
  Specific Libraries: {', '.join(claim_dict.get('specific_libraries', [])) or 'Not specified'}
  Claim: {claim_dict.get('claim_text', '')}
  Stated Difficulty: {claim_dict.get('difficulty', 3)}/5

CODE EVIDENCE (file path : name, then source):
{evidence_summary}

Return ONLY JSON: {{"score": <0-40>, "reasoning": "<2-3 sentences citing specific files/functions>"}}"""

                response = await llm.ainvoke([HumanMessage(content=analysis_prompt)])
                analysis = parse_json_response(response.content)
                llm_score = min(max(int(analysis.get("score", 0)), 0), 40)
                reasoning = analysis.get("reasoning", "")

            except Exception as e:
                reasoning = f"Analysis error: {str(e)}"
    else:
        reasoning = "No code evidence found in the repository for this claim."

    # ── Final score & status ──────────────────────────────────────────────────
    final_score = min(base_score + llm_score, 100)
    if final_score >= 60:
        status = "Verified"
    elif final_score >= 30:
        status = "Partially Verified"
    else:
        status = "Unverified"

    return VerificationResult(
        claim_id=claim_id,
        topic=claim_dict.get("topic", ""),
        claim_text=claim_dict.get("claim_text", ""),
        status=status,
        score=final_score,
        evidence_node_ids=evidence.node_ids,
        reasoning=reasoning,
        complexity_analysis=complexity_analysis,
        score_breakdown={
            "evidence_base": evidence_base,
            "node_bonus": node_bonus,
            "complexity": depth_bonus,
            "llm": llm_score,
        },
    ).model_dump()


async def grader_node(state: VerificationState) -> VerificationState:
    """
    Grade each claim based on evidence. Opt 1: all LLM calls run concurrently
    behind a semaphore of 8 (safe with primary + backup Groq key).

    Input: claims + evidence_map
    Output: results (list of VerificationResult)
    """
    claims  = state["claims"]
    evidence_map = state["evidence_map"]

    llm = get_llm_model(temperature=0.1)

    # Re-use the module-level semaphore so that grader + coach calls share budget
    sem = _GRADER_SEM

    tasks = [
        _grade_one_claim(
            i,
            claim_dict,
            evidence_map.get(claim_dict.get("id", f"claim_{i}"), {}),
            llm,
            sem,
        )
        for i, claim_dict in enumerate(claims)
    ]

    results = await asyncio.gather(*tasks)
    state["results"] = list(results)
    return state


# =============================================================================
# LangGraph Workflow
# =============================================================================


def create_verification_workflow():
    """
    Create the LangGraph verification workflow.
    
    Flow: START -> ResumeParser -> GraphAuditor -> Grader -> END
    """
    workflow = StateGraph(VerificationState)
    
    # Add nodes
    workflow.add_node("parser", resume_parser_node)
    workflow.add_node("auditor", graph_auditor_node)
    workflow.add_node("grader", grader_node)
    
    # Define edges
    workflow.set_entry_point("parser")
    workflow.add_edge("parser", "auditor")
    workflow.add_edge("auditor", "grader")
    workflow.add_edge("grader", END)
    
    return workflow.compile()


# =============================================================================
# Main Entry Point
# =============================================================================

async def analyze_resume(
    resume_text: str, 
    repo_id: str, 
    repo_path: Optional[str] = None
) -> dict[str, Any]:
    """
    Run the full verification workflow on a resume.
    
    Args:
        resume_text: Raw text extracted from resume PDF
        repo_id: ID of the repository to verify against
        repo_path: Optional path to repository for forensics analysis
        
    Returns:
        Dictionary with claims, evidence, verification results, and forensics
    """
    workflow = create_verification_workflow()
    
    initial_state: VerificationState = {
        "resume_text": resume_text,
        "repo_id": repo_id,
        "repo_ids": [repo_id],
        "claims": [],
        "evidence_map": {},
        "results": [],
        "errors": [],
    }

    final_state = await workflow.ainvoke(initial_state)
    
    # Run forensics analysis if repo path provided
    forensics_data = None
    if repo_path:
        try:
            from .forensics import analyze_stylometry, get_forensics_summary
            forensics_report = analyze_stylometry(repo_path)
            forensics_data = get_forensics_summary(forensics_report)
        except Exception as e:
            final_state["errors"].append(f"Forensics analysis error: {str(e)}")
    
    result = {
        "repo_id": repo_id,
        "claims_extracted": len(final_state["claims"]),
        "claims": final_state["claims"],
        "verification_results": final_state["results"],
        "errors": final_state["errors"],
        "summary": _generate_summary(final_state["results"])
    }
    
    # Add forensics data if available
    if forensics_data:
        result["forensics"] = forensics_data
        result["authenticity_score"] = forensics_data.get("authenticity_score", 100)
    else:
        result["authenticity_score"] = None  # Not analyzed
    
    return result


async def analyze_resume_stream(
    resume_text: str,
    repo_id: str,
    repo_path: Optional[str] = None
):
    """
    Run the full verification workflow on a resume, streaming progress.
    Yields Server-Sent Events (SSE) format strings.
    """
    import json
    workflow = create_verification_workflow()
    
    initial_state: VerificationState = {
        "resume_text": resume_text,
        "repo_id": repo_id,
        "repo_ids": [repo_id],
        "claims": [],
        "evidence_map": {},
        "results": [],
        "errors": [],
    }
    
    node_names = {
        "parser": "Extracting claims from resume",
        "auditor": "Gathering mapped evidence from codebase AST",
        "grader": "Agent verifying claims against evidence",
    }

    final_state = initial_state
    
    try:
        async for event in workflow.astream(initial_state):
            for node_name, node_state in event.items():
                final_state = node_state
                
                # Send progress update
                msg = node_names.get(node_name, f"Running {node_name}")
                progress_data = {
                    "type": "progress",
                    "message": msg,
                    "node": node_name
                }
                yield f"data: {json.dumps(progress_data)}\n\n"
    except Exception as e:
        import traceback
        error_msg = f"Graph execution failed: {str(e)}"
        print(f"ERROR in streaming: {error_msg}")
        traceback.print_exc()
        if "errors" not in final_state:
            final_state["errors"] = []
        final_state["errors"].append(error_msg)
        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
        return
            
    # Run forensics analysis if repo path provided
    forensics_data = None
    if repo_path:
        try:
            yield f"data: {json.dumps({'type': 'progress', 'message': 'Running stylometric forensics analysis...', 'node': 'forensics'})}\n\n"
            from .forensics import analyze_stylometry, get_forensics_summary
            forensics_report = analyze_stylometry(repo_path)
            forensics_data = get_forensics_summary(forensics_report)
        except Exception as e:
            if "errors" not in final_state:
                final_state["errors"] = []
            final_state["errors"].append(f"Forensics analysis error: {str(e)}")
    
    result = {
        "type": "complete",
        "repo_id": repo_id,
        "claims_extracted": len(final_state.get("claims", [])),
        "claims": final_state.get("claims", []),
        "verification_results": final_state.get("results", []),
        "errors": final_state.get("errors", []),
        "summary": _generate_summary(final_state.get("results", []))
    }
    
    if forensics_data:
        result["forensics"] = forensics_data
        result["authenticity_score"] = forensics_data.get("authenticity_score", 100)
    else:
        result["authenticity_score"] = None
    
    yield f"data: {json.dumps(result)}\n\n"


NOT_ASSESSED_STATUSES = {"Not Code-Verifiable", "Repo Not Available"}


def _generate_summary(results: list[dict]) -> dict:
    """Generate a summary of verification results."""
    if not results:
        return {"verified": 0, "partially_verified": 0, "unverified": 0,
                "not_assessed": 0, "total_claims": 0, "average_score": 0}

    assessed = [r for r in results if r["status"] not in NOT_ASSESSED_STATUSES]
    not_assessed = len(results) - len(assessed)

    verified   = sum(1 for r in assessed if r["status"] == "Verified")
    partial    = sum(1 for r in assessed if r["status"] == "Partially Verified")
    unverified = sum(1 for r in assessed if r["status"] == "Unverified")
    avg_score  = round(sum(r["score"] for r in assessed) / max(len(assessed), 1), 1)

    return {
        "verified": verified,
        "partially_verified": partial,
        "unverified": unverified,
        "not_assessed": not_assessed,
        "total_claims": len(results),
        "average_score": avg_score,
    }



async def analyze_resume_multi_stream(
    resume_text: str,
    repo_ids: list[str],
    repo_paths=None,
):
    """
    Single-pass verification across all repo_ids simultaneously.
    Claims are routed to the best-matching repos via build_repo_profile_map.
    Yields SSE events in the same shape as analyze_resume_stream.
    """
    import json
    workflow = create_verification_workflow()

    initial_state: VerificationState = {
        "resume_text": resume_text,
        "repo_id": repo_ids[0],
        "repo_ids": repo_ids,
        "claims": [],
        "evidence_map": {},
        "results": [],
        "errors": [],
    }

    node_names = {
        "parser":  "Extracting claims from resume",
        "auditor": "Routing & gathering evidence from code graph",
        "grader":  "Verifying claims against evidence",
    }

    final_state = initial_state
    try:
        async for event in workflow.astream(initial_state):
            for node_name, node_state in event.items():
                final_state = node_state
                msg = node_names.get(node_name, f"Running {node_name}")
                yield f"data: {json.dumps({'type': 'progress', 'message': msg, 'node': node_name})}\n\n"
    except Exception as e:
        import traceback
        traceback.print_exc()
        if "errors" not in final_state:
            final_state["errors"] = []
        final_state["errors"].append(str(e))
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return

    forensics_data = None
    if repo_paths:
        try:
            yield f"data: {json.dumps({'type': 'progress', 'message': 'Running stylometric forensics...', 'node': 'forensics'})}\n\n"
            from .forensics import analyze_stylometry, get_forensics_summary
            forensics_report = analyze_stylometry(repo_paths[0])
            forensics_data = get_forensics_summary(forensics_report)
        except Exception as e:
            final_state["errors"].append(f"Forensics error: {str(e)}")

    result = {
        "type": "complete",
        "status": "multi_repo_complete",
        "repo_id": ",".join(repo_ids),
        "claims_extracted": len(final_state.get("claims", [])),
        "claims": final_state.get("claims", []),
        "verification_results": final_state.get("results", []),
        "errors": final_state.get("errors", []),
        "summary": _generate_summary(final_state.get("results", [])),
        "authenticity_score": forensics_data.get("authenticity_score", 100) if forensics_data else None,
        "forensics": forensics_data,
    }
    yield f"data: {json.dumps(result)}\n\n"

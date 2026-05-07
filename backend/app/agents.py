"""
Reasoning Core - Multi-Agent Verification System
Implements the Verification Loop workflow using LangGraph.

Workflow (from project_spec.md):
    Node A (Parser): Input PDF -> Output List[ResumeClaim]
    Node B (Auditor): Input ResumeClaim -> Action query_graph(cypher) -> Output GraphContext  
    Node C (Grader): Input Claim + GraphContext -> Output VerificationResult (0-100 Score)
"""

import os
from typing import Annotated, Any, TypedDict, Optional, Union
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

from .db import query_graph
from .llm import get_llm_model, parse_json_response


# =============================================================================
# Pydantic Models (from project_spec.md)
# =============================================================================

class ResumeClaim(BaseModel):
    """A single claim extracted from a resume"""
    topic: str = Field(description="The skill or technology category (e.g., 'Python', 'Machine Learning')")
    claim_text: str = Field(description="The exact claim made in the resume")
    difficulty: int = Field(description="Difficulty level 1-5, where 5 is expert level", ge=1, le=5)


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
}


def _expand_topic_keywords(topic: str) -> list[str]:
    """
    Expand a topic into a list of related keywords for broader Cypher matching.
    Returns the original topic + all synonym terms.
    """
    topic_lower = topic.lower().strip()
    keywords = [topic_lower]

    # Check against all synonym groups
    for group_key, synonyms in TOPIC_SYNONYMS.items():
        # If the topic matches the group key or any of its synonyms
        if (topic_lower in group_key
                or group_key in topic_lower
                or any(syn in topic_lower for syn in synonyms)):
            keywords.extend(synonyms)

    # Also split multi-word topics into individual tokens
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


def build_repo_profile_map(repo_ids: list[str]) -> dict[str, dict]:
    """
    Query Neo4j for each repo's language and import profile.
    Used to route claims to the most relevant repos.
    """
    profile_map: dict[str, dict] = {}
    for repo_id in repo_ids:
        try:
            lang_results = query_graph(
                "MATCH (f:File) WHERE f.repo_id = $rid AND f.language IS NOT NULL "
                "RETURN DISTINCT toLower(f.language) AS lang",
                {"rid": repo_id}
            )
            languages: set[str] = {r["lang"] for r in lang_results if r.get("lang")}

            import_results = query_graph(
                "MATCH (i:Import) WHERE i.repo_id = $rid "
                "RETURN DISTINCT toLower(i.module_name) AS mod LIMIT 50",
                {"rid": repo_id}
            )
            imports: set[str] = {r["mod"] for r in import_results if r.get("mod")}

            name_results = query_graph(
                "MATCH (n) WHERE n.repo_id = $rid AND n.name IS NOT NULL "
                "AND (n:Function OR n:Class) "
                "RETURN DISTINCT toLower(n.name) AS nm LIMIT 60",
                {"rid": repo_id}
            )
            names: set[str] = {r["nm"] for r in name_results if r.get("nm")}

            profile_map[repo_id] = {"languages": languages, "imports": imports, "names": names}
        except Exception:
            profile_map[repo_id] = {"languages": set(), "imports": set(), "names": set()}
    return profile_map


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
    Uses expanded synonym-based matching for broader coverage.
    """
    # Build a query that searches for relevant patterns
    # The $keywords parameter will be a list of strings
    query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids
      AND ANY(kw IN $keywords WHERE
        toLower(n.name) CONTAINS kw
        OR (n:Import AND toLower(n.module_name) CONTAINS kw)
      )
    WITH n, labels(n) AS node_labels
    OPTIONAL MATCH (n)-[:CALLS]->(called:Function)
    WHERE n:Function
    RETURN
        n,
        node_labels,
        n.complexity_score AS complexity,
        collect(DISTINCT called.name) AS calls_functions
    LIMIT 50
    """
    return query


def query_knowledge_graph(
    claim: ResumeClaim,
    repo_ids: list[str],
) -> GraphEvidence:
    """
    Query the Neo4j knowledge graph to find evidence for a claim.
    Uses expanded synonym-based matching for broader coverage.
    """
    # Expand the topic into a list of related keywords
    keywords = _expand_topic_keywords(claim.topic)
    
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
    
    # Parse results into evidence
    node_ids = []
    node_types = []
    code_snippets = []
    complexity_scores = []
    
    for record in results:
        node = record.get("n", {})
        labels = record.get("node_labels", [])
        complexity = record.get("complexity")
        
        # Extract node ID (using name + file_path as composite ID)
        node_name = node.get("name", node.get("module_name", "unknown"))
        file_path = node.get("file_path", node.get("path", ""))
        node_id = f"{file_path}:{node_name}" if file_path else node_name
        
        node_ids.append(node_id)
        node_types.extend(labels)
        
        if complexity is not None:
            complexity_scores.append(complexity)
        
        # Create a code snippet reference
        if "Function" in labels:
            args = node.get("args", [])
            snippet = f"def {node_name}({', '.join(args)})"
            code_snippets.append(snippet)
        elif "Class" in labels:
            snippet = f"class {node_name}"
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
    
    system_prompt = """You are an expert resume analyzer. Your task is to extract specific, verifiable technical claims from a resume.

For each claim, identify:
1. **topic**: The specific technology, language, framework, or skill (e.g., "Python", "React", "Machine Learning", "REST APIs")
2. **claim_text**: The exact claim being made (e.g., "Built a recommendation engine using collaborative filtering")
3. **difficulty**: Rate the claimed expertise level 1-5:
   - 1: Basic familiarity
   - 2: Can use with guidance
   - 3: Proficient, independent work
   - 4: Advanced, complex projects
   - 5: Expert level, leadership/architecture

Focus on TECHNICAL claims that could be verified by analyzing code. Ignore soft skills, education dates, or company names.

Return ONLY valid JSON in this exact format:
{
  "claims": [
    {"topic": "...", "claim_text": "...", "difficulty": 3},
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
        
        # Parse the response using shared utility
        parsed = parse_json_response(response.content)
        claims = parsed.get("claims", [])
        
        # Add unique IDs to each claim — prefix with repo_id slice to prevent
        # collisions when multiple repos are analyzed and results are merged
        repo_prefix = state["repo_id"][:6] if state.get("repo_id") else "repo"
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
    Applies claim-type filtering (Layer 1) and repo routing (Layer 2).
    """
    claims = state["claims"]
    repo_ids = state.get("repo_ids") or [state["repo_id"]]
    evidence_map: dict[str, dict] = {}

    # Build repo profile map once for all routing decisions
    repo_profile_map = build_repo_profile_map(repo_ids)

    for claim_dict in claims:
        claim_id = claim_dict.get("id", f"claim_{claims.index(claim_dict)}")

        # Layer 1 — skip not-code-verifiable claims immediately
        if claim_dict.get("claim_type") == "not_code_verifiable":
            claim_dict["skip_reason"] = "not_code_verifiable"
            evidence_map[claim_id] = GraphEvidence().model_dump()
            continue

        # Layer 2 — route claim to relevant repos (falls back to all if no match)
        target_repos, was_fallback = route_claim_to_repos(claim_dict, repo_profile_map)
        if not target_repos:
            target_repos = repo_ids
            was_fallback = True

        valid_fields = {k for k in ResumeClaim.model_fields}
        claim = ResumeClaim(**{k: v for k, v in claim_dict.items() if k in valid_fields})

        try:
            evidence = query_knowledge_graph(claim, target_repos)
            # If routing fell back to all repos AND still no evidence found → mark it
            if was_fallback and not evidence.node_ids:
                claim_dict["skip_reason"] = "repo_not_available"
            evidence_map[claim_id] = evidence.model_dump()
        except Exception as e:
            state["errors"].append(f"Auditor error for {claim_id}: {str(e)}")
            evidence_map[claim_id] = GraphEvidence().model_dump()

    state["evidence_map"] = evidence_map
    return state


# =============================================================================
# Node C: Grader
# =============================================================================

async def grader_node(state: VerificationState) -> VerificationState:
    """
    Grade each claim based on the evidence found.
    
    Scoring criteria:
    - Evidence exists: +30 points base
    - Number of matching nodes: +5 per node (max 20)
    - Complexity matches difficulty: +20 if aligned
    - Code patterns match claim: +30 from LLM analysis
    
    Input: claims + evidence_map
    Output: results (list of VerificationResult)
    """
    claims  = state["claims"]
    evidence_map = state["evidence_map"]
    results: list[dict] = []

    llm = get_llm_model(temperature=0.1)

    for i, claim_dict in enumerate(claims):
        # Handle Layer-1 / Layer-2 skipped claims first
        skip_reason = claim_dict.get("skip_reason")
        if skip_reason == "not_code_verifiable":
            results.append(VerificationResult(
                claim_id=claim_dict.get("id", f"claim_{i}"),
                topic=claim_dict.get("topic", ""),
                claim_text=claim_dict.get("claim_text", ""),
                status="Not Code-Verifiable",
                score=0,
                evidence_node_ids=[],
                reasoning="This claim describes a methodology, soft skill, or domain concept that does not manifest directly in source code and cannot be verified via code analysis.",
                complexity_analysis="",
                score_breakdown={},
            ).model_dump())
            continue
        if skip_reason == "repo_not_available":
            results.append(VerificationResult(
                claim_id=claim_dict.get("id", f"claim_{i}"),
                topic=claim_dict.get("topic", ""),
                claim_text=claim_dict.get("claim_text", ""),
                status="Repo Not Available",
                score=0,
                evidence_node_ids=[],
                reasoning="No ingested repository covers this technology area. Ingest a relevant repository to verify this claim.",
                complexity_analysis="",
                score_breakdown={},
            ).model_dump())
            continue


        claim_id = claim_dict.get("id", f"claim_{i}")
        evidence_dict = evidence_map.get(claim_id, {})
        evidence = GraphEvidence(**evidence_dict) if evidence_dict else GraphEvidence()
        
        # Calculate base score from evidence
        evidence_base = 0
        node_bonus = 0
        complexity_bonus = 0
        complexity_analysis = ""

        # Evidence exists
        if evidence.node_ids:
            evidence_base = 30

            # Bonus for number of nodes (max 20 points)
            node_bonus = min(len(evidence.node_ids) * 5, 20)

            # Complexity analysis
            if evidence.complexity_scores:
                avg_complexity = sum(evidence.complexity_scores) / len(evidence.complexity_scores)
                claimed_difficulty = claim_dict.get("difficulty", 3)

                # Map difficulty to expected complexity ranges
                complexity_thresholds = {1: 2, 2: 4, 3: 6, 4: 10, 5: 15}
                expected_complexity = complexity_thresholds.get(claimed_difficulty, 5)

                if avg_complexity >= expected_complexity * 0.7:
                    complexity_bonus = 20
                    complexity_analysis = f"Code complexity (avg: {avg_complexity:.1f}) supports claimed difficulty level {claimed_difficulty}."
                else:
                    complexity_analysis = f"Code complexity (avg: {avg_complexity:.1f}) is lower than expected for difficulty level {claimed_difficulty}."

        base_score = evidence_base + node_bonus + complexity_bonus

        # Use LLM to analyze if evidence supports claim (up to 30 more points)
        llm_score = 0
        reasoning = ""

        if evidence.code_snippets:
            try:
                analysis_prompt = f"""Analyze if this code evidence supports the resume claim.

CLAIM: {claim_dict.get('claim_text', '')}
TOPIC: {claim_dict.get('topic', '')}
DIFFICULTY CLAIMED: {claim_dict.get('difficulty', 3)}/5

CODE EVIDENCE FOUND:
{chr(10).join(evidence.code_snippets[:10])}

NODE TYPES: {', '.join(evidence.node_types)}
FUNCTIONS FOUND: {len([t for t in evidence.node_types if t == 'Function'])}
CLASSES FOUND: {len([t for t in evidence.node_types if t == 'Class'])}

Provide:
1. A score 0-30 for how well the evidence supports the claim
2. A brief explanation

Return JSON: {{"score": <0-30>, "reasoning": "<explanation>"}}"""

                response = await llm.ainvoke([HumanMessage(content=analysis_prompt)])
                analysis = parse_json_response(response.content)
                llm_score = min(max(analysis.get("score", 0), 0), 30)
                reasoning = analysis.get("reasoning", "")

            except Exception as e:
                reasoning = f"Analysis error: {str(e)}"
        else:
            reasoning = "No code evidence found in the repository for this claim."

        # Calculate final score
        final_score = min(base_score + llm_score, 100)

        # Determine status
        if final_score >= 70:
            status = "Verified"
        elif final_score >= 40:
            status = "Partially Verified"
        else:
            status = "Unverified"

        result = VerificationResult(
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
                "complexity": complexity_bonus,
                "llm": llm_score,
            },
        )
        
        results.append(result.model_dump())
    
    state["results"] = results
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

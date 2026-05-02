"""
Graph Explanation Generator
Generates a natural-language architectural overview of a repository's
knowledge graph using only structural statistics (no raw source code).
"""

from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from .llm import get_llm_model, parse_json_response


SYSTEM_PROMPT = """You are a senior software architect reviewing a codebase's structural statistics.
You have been given high-level graph metrics about a code repository — NOT the actual source code.

Your job is to produce a concise, insightful architectural summary that helps a technical interviewer
understand what this codebase likely does and how it is structured.

Guidelines:
- Base your analysis ONLY on the statistics provided
- Be specific and concrete — reference actual function names and counts given
- Identify the architecture style from the structure (e.g. pipeline, MVC, library, microservice, monolith)
- Keep the summary factual and professional — no speculation beyond what the data supports
- The key_observations should be actionable insights, not generic statements

Return ONLY valid JSON, no markdown:
{
  "summary": "<2-3 sentence overview: what this codebase likely does and its overall structure>",
  "architecture_style": "<one of: Monolithic | Pipeline | MVC | Library | Service | Data Processing | ML/AI | API Server | CLI Tool | Mixed>",
  "key_observations": [
    "<observation 1 referencing specific node names or counts>",
    "<observation 2>",
    "<observation 3>"
  ],
  "complexity_verdict": "<one of: Low | Medium | High | Very High>",
  "complexity_reasoning": "<1 sentence explaining the complexity verdict>"
}"""


async def generate_graph_explanation(graph_stats: dict) -> dict[str, Any]:
    """
    Generate a structural overview of a repository from graph statistics.

    Args:
        graph_stats: dict containing:
            repo_id, node_count, edge_count, type_counts,
            top_complex (list of {name, complexity_score, type}),
            top_hubs (list of {name, degree, type}),
            orphan_count

    Returns:
        Structured explanation dict with summary, architecture_style,
        key_observations, complexity_verdict, complexity_reasoning
    """
    repo_name = graph_stats.get("repo_id", "unknown").split("/")[-1]
    type_counts = graph_stats.get("type_counts", {})
    top_complex = graph_stats.get("top_complex", [])
    top_hubs = graph_stats.get("top_hubs", [])

    # Build a readable context block
    top_complex_str = "\n".join(
        f"  - {n['name']} (complexity: {n['complexity_score']}, type: {n['type']})"
        for n in top_complex[:5]
    ) or "  (none available)"

    top_hubs_str = "\n".join(
        f"  - {n['name']} ({n['degree']} connections, type: {n['type']})"
        for n in top_hubs[:5]
    ) or "  (none available)"

    user_message = f"""Analyze this repository's code graph statistics:

Repository: {repo_name}

Node breakdown:
  - Files: {type_counts.get('File', 0)}
  - Classes: {type_counts.get('Class', 0)}
  - Functions: {type_counts.get('Function', 0)}
  - Imports: {type_counts.get('Import', 0)}
  - Total nodes: {graph_stats.get('node_count', 0)}
  - Total edges: {graph_stats.get('edge_count', 0)}
  - Disconnected nodes (orphans): {graph_stats.get('orphan_count', 0)}

Most complex functions (by cyclomatic complexity):
{top_complex_str}

Most connected nodes (architectural hubs):
{top_hubs_str}

Provide a concise architectural summary as JSON."""

    model = get_llm_model(temperature=0.3)
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    response = await model.ainvoke(messages)
    response_text = response.content if hasattr(response, "content") else str(response)
    return parse_json_response(response_text)

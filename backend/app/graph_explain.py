"""
Graph Explanation Generator
Generates a rich, structured architectural overview of a repository's
knowledge graph using structural graph statistics + node name signals.
"""

from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from .llm import get_llm_model, parse_json_response


SYSTEM_PROMPT = """You are a senior software architect conducting a deep code review using only structural graph statistics — NOT the raw source code.

Your task is to produce a comprehensive, expert-level architectural analysis that a senior engineer would find genuinely useful.

Guidelines:
- Base your analysis ONLY on the statistics and node names provided
- Be specific and concrete — reference actual function/file/class names given
- Infer the tech stack from import names and file names (e.g. "fastapi" import → FastAPI, ".py" files → Python)
- Identify logical modules/subsystems by clustering related file names
- The improvement_suggestions must be concrete and actionable (not generic advice like "add tests")
- The hotspot_analysis should name the specific files/functions that pose the highest maintenance risk and why
- key_observations should each reference at least one specific name from the data

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<3-4 sentence executive overview: what this codebase does, how it is structured, and its overall health>",
  "architecture_style": "<one of: Monolithic | Pipeline | MVC | Library | Service | Data Processing | ML/AI | API Server | CLI Tool | Mixed>",
  "tech_stack": ["<inferred technology 1>", "<inferred technology 2>", ...],
  "modules": [
    {
      "name": "<logical module/subsystem name>",
      "role": "<1 sentence describing what this subsystem does>",
      "key_files": ["<file1>", "<file2>"]
    }
  ],
  "key_observations": [
    "<observation 1 referencing specific node names or metrics>",
    "<observation 2>",
    "<observation 3>",
    "<observation 4>",
    "<observation 5>"
  ],
  "hotspot_analysis": "<1-2 sentences identifying the highest-risk files/functions by name and explaining why they are risky>",
  "improvement_suggestions": [
    "<specific, actionable suggestion 1 referencing a file or function name>",
    "<specific, actionable suggestion 2>",
    "<specific, actionable suggestion 3>"
  ],
  "complexity_verdict": "<one of: Low | Medium | High | Very High>",
  "complexity_reasoning": "<1 sentence explaining the verdict using the metrics>"
}"""


async def generate_graph_explanation(graph_stats: dict) -> dict[str, Any]:
    """
    Generate a rich structural overview of a repository from graph statistics.

    Args:
        graph_stats: dict containing repo_id, node_count, edge_count, type_counts,
                     top_complex, top_hubs, orphan_count, file_list, edge_type_counts,
                     avg_complexity, class_list, import_list, repo_names

    Returns:
        Structured explanation dict with 9 fields including tech_stack, modules,
        hotspot_analysis, and improvement_suggestions.
    """
    repo_id = graph_stats.get("repo_id", "unknown")
    repo_name = repo_id.split("/")[-1]
    repo_names = graph_stats.get("repo_names", [])
    display_name = ", ".join(repo_names) if repo_names else repo_name

    type_counts = graph_stats.get("type_counts", {})
    top_complex = graph_stats.get("top_complex", [])
    top_hubs = graph_stats.get("top_hubs", [])
    file_list = graph_stats.get("file_list", [])
    edge_type_counts = graph_stats.get("edge_type_counts", {})
    avg_complexity = graph_stats.get("avg_complexity", 0.0)
    class_list = graph_stats.get("class_list", [])
    import_list = graph_stats.get("import_list", [])

    # Format sections
    top_complex_str = "\n".join(
        f"  - {n['name']} (complexity: {n.get('complexity_score', '?')}, "
        f"type: {n.get('type', '?')}"
        + (f", in: {n['file_path']}" if n.get('file_path') else "") + ")"
        for n in top_complex[:10]
    ) or "  (none available)"

    top_hubs_str = "\n".join(
        f"  - {n['name']} ({n.get('degree', '?')} connections, type: {n.get('type', '?')}"
        + (f", in: {n['file_path']}" if n.get('file_path') else "") + ")"
        for n in top_hubs[:10]
    ) or "  (none available)"

    file_list_str = ", ".join(file_list[:20]) or "(none available)"
    class_list_str = ", ".join(class_list[:10]) or "(none)"
    import_list_str = ", ".join(import_list[:15]) or "(none)"

    edge_type_str = "\n".join(
        f"  - {etype}: {count} edges"
        for etype, count in sorted(edge_type_counts.items(), key=lambda x: -x[1])
    ) or "  (none available)"

    user_message = f"""Analyze this repository's code graph statistics and produce a comprehensive architectural summary.

Repository: {display_name}

=== STRUCTURAL OVERVIEW ===
Node breakdown:
  - Files: {type_counts.get('File', 0)}
  - Classes: {type_counts.get('Class', 0)}
  - Functions: {type_counts.get('Function', 0)}
  - Imports: {type_counts.get('Import', 0)}
  - Total nodes: {graph_stats.get('node_count', 0)}
  - Total edges: {graph_stats.get('edge_count', 0)}
  - Disconnected nodes (orphans): {graph_stats.get('orphan_count', 0)}
  - Average cyclomatic complexity: {avg_complexity:.1f}

=== EDGE / RELATIONSHIP TYPES ===
{edge_type_str}

=== FILES (top {min(len(file_list), 20)}) ===
{file_list_str}

=== CLASSES (top {min(len(class_list), 10)}) ===
{class_list_str}

=== IMPORTS / THIRD-PARTY DEPENDENCIES (top {min(len(import_list), 15)}) ===
{import_list_str}

=== MOST COMPLEX FUNCTIONS (top {min(len(top_complex), 10)} by cyclomatic complexity) ===
{top_complex_str}

=== ARCHITECTURAL HUBS (top {min(len(top_hubs), 10)} most connected nodes) ===
{top_hubs_str}

Using ALL of the above data, produce a thorough architectural analysis as the JSON schema specified."""

    model = get_llm_model(temperature=0.4)
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    response = await model.ainvoke(messages)
    response_text = response.content if hasattr(response, "content") else str(response)
    return parse_json_response(response_text)

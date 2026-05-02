"""
Function Explanation Generator
Generates a plain-English explanation of a specific function's source code
to help technical interviewers understand what the code does.
"""

from typing import Any, Optional
from langchain_core.messages import HumanMessage, SystemMessage
from .llm import get_llm_model, parse_json_response


SYSTEM_PROMPT = """You are a senior software engineer explaining code clearly to a technical interviewer.
The interviewer can already see the code — your job is to explain what it MEANS, not just restate it.

Guidelines:
- purpose: Be specific about what this function achieves, not generic ("validates input" is bad; "validates that the JWT token has not expired and matches the stored user session" is good)
- how_it_works: Walk through the actual logic step-by-step in plain English. Reference variable names and conditions from the code.
- complexity_note: Only populate if complexity_score > 5. Explain WHICH branches/conditions drive the complexity.
- watch_out_for: Real gotchas, edge cases, or design concerns visible in the code. If none are notable, return null.
- interview_angle: One sentence on what this function reveals about the candidate's engineering ability.

Return ONLY valid JSON, no markdown:
{
  "purpose": "<1-2 sentence specific purpose>",
  "how_it_works": "<3-6 sentence step-by-step explanation referencing actual variable/function names>",
  "complexity_note": "<explanation of complexity drivers, or null if complexity <= 5>",
  "watch_out_for": "<notable edge cases or concerns, or null if none>",
  "interview_angle": "<1 sentence on engineering signal>"
}"""


async def generate_function_explanation(fn_data: dict) -> dict[str, Any]:
    """
    Generate a plain-English explanation of a function's source code.

    Args:
        fn_data: dict containing:
            source_code, function_name, file_path, args,
            parent_class (optional), complexity_score (optional)

    Returns:
        Structured explanation dict with purpose, how_it_works,
        complexity_note, watch_out_for, interview_angle
    """
    function_name = fn_data.get("function_name", "unknown")
    file_path = fn_data.get("file_path", "")
    args = fn_data.get("args", [])
    parent_class = fn_data.get("parent_class")
    complexity_score = fn_data.get("complexity_score")
    source_code = fn_data.get("source_code", "")

    # Detect language from file extension
    lang = "Python" if file_path.endswith(".py") else \
           "TypeScript" if file_path.endswith((".ts", ".tsx")) else \
           "JavaScript" if file_path.endswith((".js", ".jsx")) else "code"

    # Build context
    class_context = f" (method of class `{parent_class}`)" if parent_class else ""
    args_str = f"({', '.join(args)})" if args else "()"
    complexity_str = f"\nCyclomatic complexity score: {complexity_score}" if complexity_score is not None else ""

    user_message = f"""Explain this {lang} function for a technical interviewer:

Function: `{function_name}{args_str}`{class_context}
File: {file_path}{complexity_str}

Source code:
```
{source_code}
```

Provide a clear, specific explanation as JSON."""

    model = get_llm_model(temperature=0.2)
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    response = await model.ainvoke(messages)
    response_text = response.content if hasattr(response, "content") else str(response)
    return parse_json_response(response_text)

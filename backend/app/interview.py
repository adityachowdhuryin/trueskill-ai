"""
Interview Question Generator
Generates personalised technical interview questions based on verified
skill evidence extracted from the candidate's actual code.
"""

from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from .llm import get_llm_model, parse_json_response


SYSTEM_PROMPT = """You are a senior technical interviewer at a top-tier engineering company.

Your job is to generate highly specific, personalised interview questions based on:
1. A verified skill claim from a candidate's resume
2. The ACTUAL code evidence found in their repository (function names, class names, imports, complexity scores)

RULES:
- Questions must reference the SPECIFIC code found (e.g. "Your `train_model()` function…")
- Mix levels: Easy (warm-up), Medium (depth check), Hard (expert probe)
- Do NOT generate generic textbook questions unrelated to their code
- Questions should expose whether the candidate truly understands their own code
- For each question include a brief "expected_answer_hint" (1-2 sentences) to help the interviewer evaluate the response

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "level": "Easy|Medium|Hard",
      "question": "<personalised question referencing their code>",
      "expected_answer_hint": "<what a good answer covers>",
      "why_this_question": "<1 sentence: what this probes>"
    }
  ],
  "interviewer_note": "<2-3 sentence summary of what to focus on for this skill>"
}"""


async def generate_interview_questions(
    topic: str,
    claim_text: str,
    difficulty: int,
    evidence_node_ids: list[str],
    code_snippets: list[str],
    reasoning: str,
    num_questions: int = 5,
) -> dict[str, Any]:
    """
    Generate personalised interview questions for a verified skill claim.

    Args:
        topic: Skill topic (e.g. "Python", "Machine Learning")
        claim_text: The exact claim from the resume
        difficulty: Claimed difficulty level 1-5
        evidence_node_ids: List of evidence node IDs (e.g. ["src/models.py:train_model"])
        code_snippets: Function/class signatures found as evidence
        reasoning: The grader's reasoning text
        num_questions: How many questions to generate (3-7)

    Returns:
        Dict with "questions" list and "interviewer_note"
    """
    num_questions = max(3, min(7, num_questions))
    llm = get_llm_model(temperature=0.5)

    # Format evidence for the prompt
    evidence_summary = "\n".join(
        f"  - {nid}" for nid in evidence_node_ids[:15]
    ) or "  (no specific code evidence found)"

    snippets_summary = "\n".join(
        f"  - {s}" for s in code_snippets[:10]
    ) or "  (no code snippets)"

    human_prompt = f"""Generate {num_questions} personalised technical interview questions for this candidate.

SKILL TOPIC: {topic}
RESUME CLAIM: "{claim_text}"
CLAIMED DIFFICULTY: {difficulty}/5
VERIFICATION REASONING: {reasoning}

CODE EVIDENCE FOUND IN THEIR REPOSITORY:
{evidence_summary}

CODE SNIPPETS (function/class signatures):
{snippets_summary}

Generate {num_questions} questions — mix Easy, Medium, and Hard.
Make them SPECIFIC to the code evidence above.
Return only the JSON, no explanation."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=human_prompt)
        ])
        data = parse_json_response(response.content)
        questions = data.get("questions", [])

        # Validate and cap
        valid_questions = []
        for q in questions[:num_questions]:
            if isinstance(q, dict) and "question" in q:
                valid_questions.append({
                    "level": q.get("level", "Medium"),
                    "question": q.get("question", ""),
                    "expected_answer_hint": q.get("expected_answer_hint", ""),
                    "why_this_question": q.get("why_this_question", ""),
                })

        return {
            "topic": topic,
            "questions": valid_questions,
            "interviewer_note": data.get("interviewer_note", ""),
            "num_generated": len(valid_questions),
        }

    except Exception as e:
        return {
            "topic": topic,
            "questions": [],
            "interviewer_note": "",
            "num_generated": 0,
            "error": str(e),
        }

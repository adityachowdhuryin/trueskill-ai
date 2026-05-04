"""
challenge.py — Adversarial Claim Challenger
Provides an LLM-powered "Devil's Advocate" view that stress-tests a
verification verdict by arguing the opposite case.
"""

from typing import Optional
from .llm import get_llm_model
from langchain_core.messages import SystemMessage, HumanMessage


SYSTEM_PROMPT = """\
You are a sceptical, experienced technical hiring manager reviewing a candidate's resume claim.
Your job is to argue AGAINST the verification verdict — even if the evidence looks positive.
Be specific: name the exact gaps in the evidence, explain what code patterns are missing,
and describe what a truly skilled practitioner would have in their repository.
Keep your challenge under 180 words. Be direct and professional — not rude, but incisive.
Do NOT repeat the original verdict or say "however". Start immediately with the challenge.
"""


async def challenge_claim(
    topic: str,
    claim_text: str,
    score: int,
    status: str,
    evidence_node_ids: list[str],
    reasoning: str,
    score_breakdown: Optional[dict] = None,
) -> str:
    """
    Generate an adversarial challenge to a verification verdict.

    Args:
        topic:             The skill topic (e.g. "Machine Learning")
        claim_text:        The original resume claim
        score:             The computed score (0-100)
        status:            "Verified" | "Partially Verified" | "Unverified"
        evidence_node_ids: List of supporting code node IDs
        reasoning:         The original AI reasoning for the verdict
        score_breakdown:   Optional dict with evidence_base/node_bonus/complexity/llm

    Returns:
        A plain-text adversarial challenge (≤180 words).
    """
    bd = score_breakdown or {}
    evidence_count = len(evidence_node_ids)
    llm_sub = bd.get("llm", "?")
    complexity_sub = bd.get("complexity", "?")

    human_prompt = f"""\
TOPIC: {topic}
CLAIM: "{claim_text}"
VERDICT: {status} (score: {score}/100)
EVIDENCE: {evidence_count} code node(s) found

SCORE BREAKDOWN:
  - Evidence presence: {bd.get('evidence_base', '?')}/30
  - Node bonus:        {bd.get('node_bonus', '?')}/20
  - Complexity match:  {complexity_sub}/20
  - LLM quality:       {llm_sub}/30

ORIGINAL REASONING: {reasoning}

Now argue why this verdict is WRONG or overly generous.
Be specific about what is missing from the code evidence.
"""

    llm = get_llm_model(temperature=0.6)
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_prompt),
    ])
    return response.content.strip()

"""
Shared LLM Utilities
Centralized LLM initialization and response parsing to avoid code duplication.
"""

import json
import os
from typing import Any

import os
from typing import Any
from langchain_groq import ChatGroq

def get_llm_model(temperature: float = 0.1) -> ChatGroq:
    """
    Initialize Groq LLM model (Llama 3 8B or Mixtral to bypass Google Rate Limits).
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable not set")

    return ChatGroq(
        model="llama-3.3-70b-versatile",
        groq_api_key=api_key,
        temperature=temperature,
    )


def parse_json_response(response_text: str) -> dict[str, Any]:
    """
    Robustly extract and parse JSON from an LLM response.

    Handles common patterns:
    - Raw JSON
    - JSON inside ```json ... ``` code blocks
    - JSON inside ``` ... ``` code blocks

    Args:
        response_text: Raw text from the LLM response

    Returns:
        Parsed dictionary

    Raises:
        ValueError: If JSON cannot be extracted or parsed
    """
    text = response_text.strip()

    # Try to extract JSON from markdown code blocks
    if "```json" in text:
        try:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        except IndexError:
            pass
    elif "```" in text:
        try:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()
        except IndexError:
            pass

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM response as JSON: {e}\nRaw text: {text[:500]}")

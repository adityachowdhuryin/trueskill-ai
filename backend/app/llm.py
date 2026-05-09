"""
Shared LLM Utilities
Centralized LLM initialization and response parsing to avoid code duplication.

Key rotation: if GROQ_API_KEY hits a rate-limit (HTTP 429), every call made
through get_llm_model() is automatically retried once with GROQ_API_KEY_BACKUP,
so the app keeps running without disruption.

No changes needed in any caller — the fallback is fully transparent.
"""

import json
import logging
import os
from typing import Any

from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

MODEL_NAME = "llama-3.3-70b-versatile"


def _is_rate_limit(exc: Exception) -> bool:
    """Return True if the exception is a Groq 429 rate-limit error."""
    msg = str(exc).lower()
    return "429" in msg or "rate limit" in msg or "rate_limit" in msg or "too many requests" in msg


class _FallbackChatGroq:
    """
    Thin wrapper around ChatGroq that transparently retries with a backup
    API key whenever the primary key hits a 429 rate-limit error.

    Exposes .invoke() and .ainvoke() — the same interface as ChatGroq — so
    all existing callers work without any changes.
    """

    def __init__(self, temperature: float) -> None:
        self._temperature = temperature
        primary = os.getenv("GROQ_API_KEY")
        backup  = os.getenv("GROQ_API_KEY_BACKUP")
        if not primary:
            raise ValueError("GROQ_API_KEY environment variable not set")
        self._primary = ChatGroq(model=MODEL_NAME, groq_api_key=primary, temperature=temperature)
        self._backup  = (
            ChatGroq(model=MODEL_NAME, groq_api_key=backup, temperature=temperature)
            if backup else None
        )

    # ── Sync ──────────────────────────────────────────────────────────────────
    def invoke(self, messages, **kwargs):
        try:
            return self._primary.invoke(messages, **kwargs)
        except Exception as exc:
            if _is_rate_limit(exc) and self._backup:
                logger.warning(
                    "Primary Groq key hit rate limit — switching to backup key. (%s)", exc
                )
                return self._backup.invoke(messages, **kwargs)
            raise

    # ── Async ─────────────────────────────────────────────────────────────────
    async def ainvoke(self, messages, **kwargs):
        try:
            return await self._primary.ainvoke(messages, **kwargs)
        except Exception as exc:
            if _is_rate_limit(exc) and self._backup:
                logger.warning(
                    "Primary Groq key hit rate limit — switching to backup key. (%s)", exc
                )
                return await self._backup.ainvoke(messages, **kwargs)
            raise

    # ── Stream passthrough (unchanged) ────────────────────────────────────────
    async def astream(self, messages, **kwargs):
        try:
            async for chunk in self._primary.astream(messages, **kwargs):
                yield chunk
        except Exception as exc:
            if _is_rate_limit(exc) and self._backup:
                logger.warning(
                    "Primary Groq key hit rate limit on stream — switching to backup key. (%s)", exc
                )
                async for chunk in self._backup.astream(messages, **kwargs):
                    yield chunk
            else:
                raise

    def stream(self, messages, **kwargs):
        try:
            yield from self._primary.stream(messages, **kwargs)
        except Exception as exc:
            if _is_rate_limit(exc) and self._backup:
                logger.warning(
                    "Primary Groq key hit rate limit on stream — switching to backup key. (%s)", exc
                )
                yield from self._backup.stream(messages, **kwargs)
            else:
                raise


def get_llm_model(temperature: float = 0.1) -> _FallbackChatGroq:
    """
    Return an LLM client with transparent fallback key rotation.
    Drop-in replacement for the previous ChatGroq return — all callers
    (agents.py, project_verifier.py, coach.py, etc.) work unchanged.
    """
    return _FallbackChatGroq(temperature=temperature)


def parse_json_response(response_text: str) -> dict[str, Any]:
    """
    Robustly extract and parse JSON from an LLM response.

    Handles common patterns:
    - Raw JSON
    - JSON inside ```json ... ``` code blocks
    - JSON inside ``` ... ``` code blocks
    """
    text = response_text.strip()

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

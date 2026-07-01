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


class _SmartFallbackLLM:
    """
    Orchestrator LLM client that prioritizes Cerebras (if configured)
    and transparently falls back to Groq (primary, then backup) upon any failure or rate limit.
    """

    def __init__(self, temperature: float) -> None:
        self._temperature = temperature
        self._clients = []

        # 1. Try adding Cerebras if configured
        cerebras_key = os.getenv("CEREBRAS_API_KEY")
        if cerebras_key:
            cerebras_model = os.getenv("CEREBRAS_MODEL", "gpt-oss-120b")
            try:
                from langchain_openai import ChatOpenAI
                cerebras_client = ChatOpenAI(
                    model=cerebras_model,
                    openai_api_key=cerebras_key,
                    openai_api_base="https://api.cerebras.ai/v1",
                    temperature=temperature
                )
                self._clients.append(("Cerebras", cerebras_client))
                logger.info(f"Initialized Cerebras client with model {cerebras_model}")
            except Exception as e:
                logger.error(f"Failed to initialize Cerebras client: {e}")

        # 2. Add Groq clients (Primary and Backup)
        groq_primary = os.getenv("GROQ_API_KEY")
        groq_backup = os.getenv("GROQ_API_KEY_BACKUP")

        if groq_primary:
            try:
                self._clients.append(("Groq Primary", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_primary,
                    temperature=temperature
                )))
            except Exception as e:
                logger.error(f"Failed to initialize Groq Primary client: {e}")

        if groq_backup:
            try:
                self._clients.append(("Groq Backup", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_backup,
                    temperature=temperature
                )))
            except Exception as e:
                logger.error(f"Failed to initialize Groq Backup client: {e}")

        if not self._clients:
            raise ValueError("No LLM clients could be initialized. Please set CEREBRAS_API_KEY or GROQ_API_KEY.")

    # ── Sync ──────────────────────────────────────────────────────────────────
    def invoke(self, messages, **kwargs):
        last_exc = None
        for name, client in self._clients:
            try:
                return client.invoke(messages, **kwargs)
            except Exception as exc:
                last_exc = exc
                logger.warning(f"{name} failed to invoke: {exc}. Trying next client...")
        raise last_exc

    # ── Async ─────────────────────────────────────────────────────────────────
    async def ainvoke(self, messages, **kwargs):
        last_exc = None
        for name, client in self._clients:
            try:
                return await client.ainvoke(messages, **kwargs)
            except Exception as exc:
                last_exc = exc
                logger.warning(f"{name} failed to ainvoke: {exc}. Trying next client...")
        raise last_exc

    # ── Stream passthrough ────────────────────────────────────────────────────
    async def astream(self, messages, **kwargs):
        last_exc = None
        for name, client in self._clients:
            try:
                async for chunk in client.astream(messages, **kwargs):
                    yield chunk
                return
            except Exception as exc:
                last_exc = exc
                logger.warning(f"{name} failed to astream: {exc}. Trying next client...")
        raise last_exc

    def stream(self, messages, **kwargs):
        last_exc = None
        for name, client in self._clients:
            try:
                yield from client.stream(messages, **kwargs)
                return
            except Exception as exc:
                last_exc = exc
                logger.warning(f"{name} failed to stream: {exc}. Trying next client...")
        raise last_exc


def get_llm_model(temperature: float = 0.1) -> _SmartFallbackLLM:
    """
    Return an LLM client with smart fallback and key rotation across multiple providers (Cerebras, Groq).
    """
    return _SmartFallbackLLM(temperature=temperature)


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

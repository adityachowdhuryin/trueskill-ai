"""
Shared LLM Utilities
Centralized LLM initialization and response parsing to avoid code duplication.

Fallback chain (in order):
  1. Groq Primary      (GROQ_API_KEY)
  2. Groq Backup       (GROQ_API_KEY_BACKUP)
  3. Groq Key 3        (GROQ_API_KEY_3)
  4. Groq Key 4        (GROQ_API_KEY_4)
  5. Gemini            (GOOGLE_API_KEY / GEMINI_API_KEY)
  6. Cerebras          (CEREBRAS_API_KEY)

Key rotation: if any Groq key hits a rate-limit (HTTP 429), the switch
happens instantly because every client is initialized with max_retries=0.
The fallback is fully transparent — no changes needed in any caller.
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
    Orchestrator LLM client that prioritizes Groq (Primary, then Backup)
    and transparently falls back to Gemini (Google AI Studio) and Cerebras upon failure or rate limit.
    """

    def __init__(self, temperature: float) -> None:
        self._temperature = temperature
        self._clients = []

        # 1. Add Groq clients (Primary and Backup) as the primary option
        groq_primary = os.getenv("GROQ_API_KEY")
        groq_backup = os.getenv("GROQ_API_KEY_BACKUP")

        if groq_primary:
            try:
                self._clients.append(("Groq Primary", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_primary,
                    temperature=temperature,
                    max_retries=0  # Fall back instantly on failure
                )))
            except Exception as e:
                logger.error(f"Failed to initialize Groq Primary client: {e}")

        if groq_backup:
            try:
                self._clients.append(("Groq Backup", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_backup,
                    temperature=temperature,
                    max_retries=0  # Fall back instantly on failure
                )))
            except Exception as e:
                logger.error(f"Failed to initialize Groq Backup client: {e}")

        # 3. Groq Key 3 — third fallback
        groq_key3 = os.getenv("GROQ_API_KEY_3")
        if groq_key3:
            try:
                self._clients.append(("Groq Key 3", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_key3,
                    temperature=temperature,
                    max_retries=0  # Fall back instantly on failure
                )))
                logger.info("Initialized Groq Key 3 client")
            except Exception as e:
                logger.error(f"Failed to initialize Groq Key 3 client: {e}")

        # 4. Groq Key 4 — fourth fallback
        groq_key4 = os.getenv("GROQ_API_KEY_4")
        if groq_key4:
            try:
                self._clients.append(("Groq Key 4", ChatGroq(
                    model=MODEL_NAME,
                    groq_api_key=groq_key4,
                    temperature=temperature,
                    max_retries=0  # Fall back instantly on failure
                )))
                logger.info("Initialized Groq Key 4 client")
            except Exception as e:
                logger.error(f"Failed to initialize Groq Key 4 client: {e}")

        # 5. Gemini (Google AI Studio) — fifth fallback
        gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if gemini_key:
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                gemini_client = ChatGoogleGenerativeAI(
                    model=gemini_model,
                    google_api_key=gemini_key,
                    temperature=temperature,
                    max_retries=0  # Fall back instantly on failure/rate limit
                )
                self._clients.append(("Gemini", gemini_client))
                logger.info(f"Initialized Gemini client with model {gemini_model}")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")

        # 6. Cerebras — sixth fallback
        cerebras_key = os.getenv("CEREBRAS_API_KEY")
        if cerebras_key:
            cerebras_model = os.getenv("CEREBRAS_MODEL", "gpt-oss-120b")
            try:
                from langchain_openai import ChatOpenAI
                cerebras_client = ChatOpenAI(
                    model=cerebras_model,
                    openai_api_key=cerebras_key,
                    openai_api_base="https://api.cerebras.ai/v1",
                    temperature=temperature,
                    max_retries=0  # Do not block and wait on 429, fall back instantly
                )
                self._clients.append(("Cerebras", cerebras_client))
                logger.info(f"Initialized Cerebras client with model {cerebras_model}")
            except Exception as e:
                logger.error(f"Failed to initialize Cerebras client: {e}")

        if not self._clients:
            raise ValueError(
                "No LLM clients could be initialized. "
                "Please set at least one of: GROQ_API_KEY, GROQ_API_KEY_BACKUP, "
                "GROQ_API_KEY_3, GROQ_API_KEY_4, GOOGLE_API_KEY, or CEREBRAS_API_KEY."
            )

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

"""
PDF Text Extraction Utility
============================
Shared, best-effort PDF text extractor used across all backend endpoints.

Strategy (in order of preference):
  1. pdfminer.six  — Best for complex/multi-column resume layouts.
  2. PyPDF2        — Fast fallback if pdfminer fails.

Both are attempted automatically; the result with more extracted text wins.
"""

from __future__ import annotations

import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract plain text from a PDF byte string.

    Tries pdfminer.six first (superior layout handling), falls back to PyPDF2.
    Returns the best (longest non-empty) result.

    Args:
        pdf_bytes: Raw bytes of the PDF file.

    Returns:
        Extracted text string (may be empty if the PDF is image-only/scanned).
    """
    pdfminer_text = _extract_with_pdfminer(pdf_bytes)
    pypdf2_text = _extract_with_pypdf2(pdf_bytes)

    # Return whichever gave more content
    if len(pdfminer_text.strip()) >= len(pypdf2_text.strip()):
        return pdfminer_text
    return pypdf2_text


def _extract_with_pdfminer(pdf_bytes: bytes) -> str:
    """Extract text using pdfminer.six (handles multi-column layouts well)."""
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract
        text = pdfminer_extract(BytesIO(pdf_bytes))
        return text or ""
    except ImportError:
        logger.debug("pdfminer.six not installed, skipping.")
        return ""
    except Exception as exc:
        logger.warning("pdfminer extraction failed: %s", exc)
        return ""


def _extract_with_pypdf2(pdf_bytes: bytes) -> str:
    """Extract text using PyPDF2 (fast, but weaker on complex layouts)."""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(BytesIO(pdf_bytes))
        parts: list[str] = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                parts.append(page_text)
        return "\n".join(parts)
    except Exception as exc:
        logger.warning("PyPDF2 extraction failed: %s", exc)
        return ""

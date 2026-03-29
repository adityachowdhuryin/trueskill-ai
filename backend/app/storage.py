"""
SQLite-based storage for candidate analysis results.
Enables saving, listing, and comparing analyses across candidates.
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Optional


DB_PATH = os.path.join(os.path.dirname(__file__), "..", "trueskill_analyses.db")


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating tables if needed."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            candidate_name TEXT NOT NULL,
            repo_names TEXT,
            repo_ids TEXT,
            results_json TEXT NOT NULL,
            skills_json TEXT,
            overall_score REAL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def save_analysis(data: dict[str, Any]) -> str:
    """Save an analysis result. Returns the analysis ID."""
    analysis_id = str(uuid.uuid4())[:8]
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO analyses (id, candidate_name, repo_names, repo_ids,
               results_json, skills_json, overall_score, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id,
                data.get("candidate_name", "Unknown"),
                json.dumps(data.get("repo_names", [])),
                json.dumps(data.get("repo_ids", [])),
                json.dumps(data.get("results", {})),
                json.dumps(data.get("skills", [])),
                data.get("overall_score", 0),
                datetime.utcnow().isoformat(),
            )
        )
        conn.commit()
        return analysis_id
    finally:
        conn.close()


def list_analyses() -> list[dict[str, Any]]:
    """List all saved analyses (summary only)."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, candidate_name, repo_names, overall_score, created_at "
            "FROM analyses ORDER BY created_at DESC"
        ).fetchall()
        return [
            {
                "id": r["id"],
                "candidate_name": r["candidate_name"],
                "repo_names": json.loads(r["repo_names"] or "[]"),
                "overall_score": r["overall_score"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def get_analysis(analysis_id: str) -> Optional[dict[str, Any]]:
    """Get a specific analysis by ID."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "candidate_name": row["candidate_name"],
            "repo_names": json.loads(row["repo_names"] or "[]"),
            "repo_ids": json.loads(row["repo_ids"] or "[]"),
            "results": json.loads(row["results_json"] or "{}"),
            "skills": json.loads(row["skills_json"] or "[]"),
            "overall_score": row["overall_score"],
            "created_at": row["created_at"],
        }
    finally:
        conn.close()

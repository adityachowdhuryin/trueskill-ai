"""
SQLite-based storage for candidate analysis results.
Enables saving, listing, and comparing analyses across candidates.
Also maintains a repo_registry table for heatmap/GitHub URL lookups.
"""

import json
import os
import secrets
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Optional


DB_PATH = os.path.join(os.path.dirname(__file__), "..", "trueskill_analyses.db")


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating tables if needed."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Analyses table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            candidate_name TEXT NOT NULL,
            repo_names TEXT,
            repo_ids TEXT,
            results_json TEXT NOT NULL,
            skills_json TEXT,
            overall_score REAL,
            created_at TEXT NOT NULL,
            share_token TEXT UNIQUE,
            is_public INTEGER DEFAULT 0
        )
    """)

    # Migrate existing tables that lack the new columns (safe no-op if already present)
    # NOTE: SQLite does NOT support ADD COLUMN with UNIQUE — omit it here
    try:
        conn.execute("ALTER TABLE analyses ADD COLUMN share_token TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE analyses ADD COLUMN is_public INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # Repo registry — maps repo_id → GitHub metadata for heatmap lookups
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repo_registry (
            repo_id TEXT PRIMARY KEY,
            github_url TEXT NOT NULL,
            owner TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            ingested_at TEXT NOT NULL
        )
    """)

    conn.commit()
    return conn


# =============================================================================
# Analysis CRUD
# =============================================================================

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
            "SELECT id, candidate_name, repo_names, overall_score, created_at, is_public "
            "FROM analyses ORDER BY created_at DESC"
        ).fetchall()
        return [
            {
                "id": r["id"],
                "candidate_name": r["candidate_name"],
                "repo_names": json.loads(r["repo_names"] or "[]"),
                "overall_score": r["overall_score"],
                "created_at": r["created_at"],
                "is_public": bool(r["is_public"]),
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
        return _row_to_dict(row)
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a sqlite3.Row to a plain dict, resilient to missing columns."""
    # Use keys() so we don't crash on columns that don't exist in older DB snapshots
    d: dict[str, Any] = {k: row[k] for k in row.keys()}
    return {
        "id": d.get("id"),
        "candidate_name": d.get("candidate_name"),
        "repo_names": json.loads(d.get("repo_names") or "[]"),
        "repo_ids": json.loads(d.get("repo_ids") or "[]"),
        "results": json.loads(d.get("results_json") or "{}"),
        "skills": json.loads(d.get("skills_json") or "[]"),
        "overall_score": d.get("overall_score", 0),
        "created_at": d.get("created_at"),
        "is_public": bool(d.get("is_public", 0)),
        "share_token": d.get("share_token"),
    }


# =============================================================================
# Sharing
# =============================================================================

def make_shareable(analysis_id: str) -> Optional[str]:
    """
    Generate (or return existing) share token for an analysis.
    Sets is_public=1. Returns the share_token, or None if analysis not found.
    """
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, share_token FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
        if not row:
            return None

        token = row["share_token"]
        if not token:
            token = secrets.token_urlsafe(24)  # 32-char URL-safe token
            conn.execute(
                "UPDATE analyses SET share_token = ?, is_public = 1 WHERE id = ?",
                (token, analysis_id)
            )
            conn.commit()
        else:
            # Already has a token — just ensure is_public is set
            conn.execute(
                "UPDATE analyses SET is_public = 1 WHERE id = ?", (analysis_id,)
            )
            conn.commit()

        return token
    finally:
        conn.close()


def get_analysis_by_token(share_token: str) -> Optional[dict[str, Any]]:
    """Retrieve a public analysis by its share token."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM analyses WHERE share_token = ? AND is_public = 1",
            (share_token,)
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


# =============================================================================
# Repo Registry (for heatmap lookups)
# =============================================================================

def register_repo(repo_id: str, github_url: str, owner: str, repo_name: str) -> None:
    """Store repo metadata at ingestion time."""
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO repo_registry
               (repo_id, github_url, owner, repo_name, ingested_at)
               VALUES (?, ?, ?, ?, ?)""",
            (repo_id, github_url, owner, repo_name, datetime.utcnow().isoformat())
        )
        conn.commit()
    finally:
        conn.close()


def get_repo_info(repo_id: str) -> Optional[dict[str, str]]:
    """Look up GitHub metadata for a repo_id."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM repo_registry WHERE repo_id = ?", (repo_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "repo_id": row["repo_id"],
            "github_url": row["github_url"],
            "owner": row["owner"],
            "repo_name": row["repo_name"],
            "ingested_at": row["ingested_at"],
        }
    finally:
        conn.close()

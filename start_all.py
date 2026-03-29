#!/usr/bin/env python3
"""
TrueSkill AI — Master Startup Script
=====================================
Launches the entire development stack with a single command:
  1. Neo4j (via docker-compose)
  2. FastAPI Backend (uvicorn with hot-reload)
  3. Next.js Frontend (npm run dev)

Usage:
    python start_all.py
"""

import subprocess
import sys
import time
import signal
import os

# ──────────────────────────────────────
#  Configuration
# ──────────────────────────────────────
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")

DB_STARTUP_WAIT = 10  # seconds to wait for Neo4j container

# ──────────────────────────────────────
#  Helpers
# ──────────────────────────────────────
processes: list[subprocess.Popen] = []


def cleanup(sig=None, frame=None):
    """Gracefully terminate all child processes."""
    print("\n🛑  Shutting down all services...")
    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass
    # Bring down docker compose as well
    try:
        subprocess.run(
            ["docker", "compose", "down"],
            cwd=ROOT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        subprocess.run(
            ["docker-compose", "down"],
            cwd=ROOT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    print("👋  All services stopped.")
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

# ──────────────────────────────────────
#  Step A — Start Database (Neo4j)
# ──────────────────────────────────────
print("=" * 50)
print("🚀  TrueSkill AI — Master Startup")
print("=" * 50)

print("\n📦  [Step A] Starting Neo4j via docker compose...")
try:
    subprocess.run(
        ["docker", "compose", "up", "-d", "neo4j"],
        cwd=ROOT_DIR,
        check=True,
    )
except (FileNotFoundError, subprocess.CalledProcessError):
    # Fallback: older Docker versions use `docker-compose` (with hyphen)
    subprocess.run(
        ["docker-compose", "up", "-d", "neo4j"],
        cwd=ROOT_DIR,
        check=True,
    )

print(f"⏳  Waiting {DB_STARTUP_WAIT}s for Neo4j to be ready...")
for i in range(DB_STARTUP_WAIT, 0, -1):
    print(f"    {i}s remaining...", end="\r")
    time.sleep(1)
print("    Neo4j should be ready now.    ")

# ──────────────────────────────────────
#  Step B — Install deps & Start Backend
# ──────────────────────────────────────
requirements_file = os.path.join(BACKEND_DIR, "requirements.txt")
venv_dir = os.path.join(BACKEND_DIR, "venv")

# Create virtualenv if it doesn't exist
if not os.path.exists(venv_dir):
    print("\n🐍  Creating Python virtualenv...")
    subprocess.run(
        [sys.executable, "-m", "venv", venv_dir],
        check=True,
    )
    print("    Virtualenv created.")

# Determine the pip and uvicorn paths inside the virtualenv
if sys.platform == "win32":
    pip_path = os.path.join(venv_dir, "Scripts", "pip")
    uvicorn_path = os.path.join(venv_dir, "Scripts", "uvicorn")
else:
    pip_path = os.path.join(venv_dir, "bin", "pip")
    uvicorn_path = os.path.join(venv_dir, "bin", "uvicorn")

if os.path.exists(requirements_file):
    print("\n📥  Installing backend dependencies (in virtualenv)...")
    result = subprocess.run(
        [pip_path, "install", "-q", "-r", "requirements.txt"],
        cwd=BACKEND_DIR,
    )
    if result.returncode == 0:
        print("    Dependencies installed.")
    else:
        print("    ⚠️  Some dependencies failed to install (check manually).")
        print("    Continuing startup anyway...")


print("\n⚙️   [Step B] Starting FastAPI backend (uvicorn)...")
backend_proc = subprocess.Popen(
    [
        uvicorn_path,
        "main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000",
    ],
    cwd=BACKEND_DIR,
)
processes.append(backend_proc)

# ──────────────────────────────────────
#  Step C — Start Frontend (Next.js)
# ──────────────────────────────────────
print("🌐  [Step C] Starting Next.js frontend (npm run dev)...")
frontend_proc = subprocess.Popen(
    ["npm", "run", "dev"],
    cwd=FRONTEND_DIR,
)
processes.append(frontend_proc)

# ──────────────────────────────────────
#  All systems go
# ──────────────────────────────────────
print("\n" + "=" * 50)
print("✅ App is running at http://localhost:3000")
print("=" * 50)
print("   Backend API  → http://localhost:8000")
print("   Neo4j Browser → http://localhost:7474")
print("   Frontend      → http://localhost:3000")
print("\n   Press Ctrl+C to stop all services.\n")

# Keep the script alive until a child exits or user interrupts
try:
    while True:
        # Check if any process has died unexpectedly
        for proc in processes:
            ret = proc.poll()
            if ret is not None:
                print(f"\n⚠️  A process exited with code {ret}. Shutting down...")
                cleanup()
        time.sleep(2)
except KeyboardInterrupt:
    cleanup()

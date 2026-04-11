#!/usr/bin/env python3
"""
TrueSkill AI — Master Startup Script
=====================================
Launches the entire development stack with a single command:
  1. Neo4j (via docker-compose)
  2. FastAPI Backend (uvicorn with hot-reload)
  3. Next.js Frontend (npm run dev)

Usage:
    python3 start_all.py
"""

import subprocess
import sys
import time
import signal
import os
import socket

# ──────────────────────────────────────
#  Patch PATH so docker/npm are found
#  (needed when launched from IDE or GUI)
# ──────────────────────────────────────
EXTRA_PATHS = [
    "/opt/homebrew/bin",   # Apple-Silicon Homebrew
    "/usr/local/bin",      # Intel Homebrew / manual installs
    "/usr/bin",
    "/bin",
]
current_path = os.environ.get("PATH", "")
for p in EXTRA_PATHS:
    if p not in current_path:
        os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")

# ──────────────────────────────────────
#  Configuration
# ──────────────────────────────────────
ROOT_DIR     = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR  = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")

BACKEND_PORT  = 8000
FRONTEND_PORT = 3000
DB_STARTUP_WAIT = 10  # seconds to wait for a *freshly started* Neo4j

# ──────────────────────────────────────
#  Helpers
# ──────────────────────────────────────
processes: list[subprocess.Popen] = []


def _port_in_use(port: int) -> bool:
    """Return True if something is already listening on *port*."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _free_port(port: int) -> None:
    """Kill any process that is currently holding *port*."""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        pids = result.stdout.strip().split()
        for pid in pids:
            if pid:
                subprocess.run(["kill", "-9", pid], check=False)
                print(f"    Killed PID {pid} that was holding port {port}.")
    except Exception as e:
        print(f"    ⚠️  Could not free port {port}: {e}")


def _run_docker(*args, **kwargs):
    """Try `docker compose` first, fall back to `docker-compose`."""
    try:
        return subprocess.run(["docker", "compose"] + list(args), **kwargs)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return subprocess.run(["docker-compose"] + list(args), **kwargs)


def cleanup(sig=None, frame=None):
    """Gracefully terminate all child processes."""
    print("\n🛑  Shutting down all services...")
    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass
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
    _run_docker("up", "-d", "neo4j", cwd=ROOT_DIR, check=True)
    neo4j_freshly_started = True
except Exception as e:
    print(f"    ⚠️  docker compose failed: {e}")
    print("    Assuming Neo4j is already running and continuing...")
    neo4j_freshly_started = False

if neo4j_freshly_started:
    print(f"⏳  Waiting {DB_STARTUP_WAIT}s for Neo4j to be ready...")
    for i in range(DB_STARTUP_WAIT, 0, -1):
        print(f"    {i}s remaining...", end="\r", flush=True)
        time.sleep(1)
    print("    Neo4j should be ready now.    ")
else:
    print("    Skipping wait — Neo4j already running.")

# ──────────────────────────────────────
#  Step B — Free ports & start Backend
# ──────────────────────────────────────
requirements_file = os.path.join(BACKEND_DIR, "requirements.txt")
venv_dir = os.path.join(BACKEND_DIR, "venv")

# Create virtualenv if it doesn't exist
if not os.path.exists(venv_dir):
    print("\n🐍  Creating Python virtualenv...")
    subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
    print("    Virtualenv created.")

# Determine pip / uvicorn inside virtualenv
if sys.platform == "win32":
    pip_path     = os.path.join(venv_dir, "Scripts", "pip")
    uvicorn_path = os.path.join(venv_dir, "Scripts", "uvicorn")
else:
    pip_path     = os.path.join(venv_dir, "bin", "pip")
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

# Free backend port if busy
if _port_in_use(BACKEND_PORT):
    print(f"\n⚠️  Port {BACKEND_PORT} busy — freeing it...")
    _free_port(BACKEND_PORT)
    time.sleep(1)

print(f"\n⚙️   [Step B] Starting FastAPI backend on :{BACKEND_PORT}...")
backend_proc = subprocess.Popen(
    [
        uvicorn_path,
        "main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", str(BACKEND_PORT),
    ],
    cwd=BACKEND_DIR,
)
processes.append(backend_proc)

# Give uvicorn a moment to bind
time.sleep(2)
if backend_proc.poll() is not None:
    print("❌  Backend failed to start! Check uvicorn logs above.")
    cleanup()

# ──────────────────────────────────────
#  Step C — Free port & start Frontend
# ──────────────────────────────────────
if _port_in_use(FRONTEND_PORT):
    print(f"\n⚠️  Port {FRONTEND_PORT} busy — freeing it...")
    _free_port(FRONTEND_PORT)
    time.sleep(1)

print(f"🌐  [Step C] Starting Next.js frontend on :{FRONTEND_PORT}...")
frontend_proc = subprocess.Popen(
    ["npm", "run", "dev"],
    cwd=FRONTEND_DIR,
)
processes.append(frontend_proc)

# ──────────────────────────────────────
#  All systems go
# ──────────────────────────────────────
print("\n" + "=" * 50)
print("✅  App is running!")
print("=" * 50)
print(f"   Frontend      → http://localhost:{FRONTEND_PORT}")
print(f"   Backend API   → http://localhost:{BACKEND_PORT}")
print(f"   API Docs      → http://localhost:{BACKEND_PORT}/docs")
print(f"   Neo4j Browser → http://localhost:7474")
print("\n   Press Ctrl+C to stop all services.\n")

# Keep alive — only exit if the user hits Ctrl+C
try:
    while True:
        for proc in processes:
            ret = proc.poll()
            if ret is not None:
                name = "Backend" if proc is backend_proc else "Frontend"
                print(f"\n⚠️  {name} exited with code {ret}.")
                print("   (Other services are still running. Press Ctrl+C to quit.)")
                processes.remove(proc)
                break
        if not processes:
            print("⚠️  All processes have exited.")
            break
        time.sleep(2)
except KeyboardInterrupt:
    cleanup()

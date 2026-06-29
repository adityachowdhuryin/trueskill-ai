"""
TrueSkill AI - Backend Entry Point
Automated Competency Verification System
"""

import os
import logging
import traceback
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables FIRST, before importing local modules like app.api
load_dotenv()

# Configure logging for production visibility
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trueskill")

from app.api import router as api_router
from app.db import neo4j_driver


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    logger.info("TrueSkill AI backend starting up...")
    yield
    # Cleanup on shutdown
    neo4j_driver.close()


app = FastAPI(
    title="TrueSkill AI",
    description="Automated Competency Verification System using GraphRAG",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Global exception handler — always return JSON with details ────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url.path, tb)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb},
    )


# CORS middleware for frontend communication
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    origins = [
        "http://localhost:3000",  # Next.js dev server
        "http://localhost:3001",  # Next.js fallback port
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "trueskill-ai-backend"}


@app.get("/debug/test-llm")
async def debug_test_llm():
    """Quick diagnostic: can the server reach Groq and get a response?"""
    try:
        from app.llm import get_llm_model
        llm = get_llm_model()
        resp = await llm.ainvoke([{"role": "user", "content": "Say 'hello' in one word."}])
        return {"status": "ok", "llm_response": resp.content}
    except Exception as e:
        logger.error("LLM test failed: %s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"status": "error", "detail": str(e), "traceback": traceback.format_exc()})


@app.get("/debug/test-neo4j")
async def debug_test_neo4j():
    """Quick diagnostic: can the server reach Neo4j?"""
    try:
        with neo4j_driver.get_session() as session:
            result = session.run("RETURN 1 AS n")
            record = result.single()
            return {"status": "ok", "neo4j_result": record["n"]}
    except Exception as e:
        logger.error("Neo4j test failed: %s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"status": "error", "detail": str(e), "traceback": traceback.format_exc()})


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

"""
Career Coach Module - Gap Analysis & Bridge Project Generator
Compares verified skills against job descriptions and generates learning projects.

Workflow 2 (from project_spec.md):
    Input: VerifiedSkills list vs JobDescription text
    Logic: Identify missing keywords + Identify "weak" verifications (Score < 50)
    Output: ProjectSuggestion (Title, Tech Stack, Step-by-Step Instructions)
"""

import os
from typing import Any, Optional, Union

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from .llm import get_llm_model, parse_json_response


# =============================================================================
# Pydantic Models
# =============================================================================

class VerifiedSkill(BaseModel):
    """A skill that has been verified from resume analysis"""
    topic: str
    score: int = Field(ge=0, le=100)
    status: str  # Verified, Partially Verified, Unverified


class BridgeProject(BaseModel):
    """A mini-project to bridge a skill gap"""
    gap_skill: str = Field(description="The missing or weak skill identified")
    project_title: str = Field(description="A catchy title for the learning project")
    description: str = Field(description="Brief description of what the project accomplishes")
    tech_stack: list[str] = Field(description="Technologies used in the project")
    difficulty: str = Field(description="Beginner, Intermediate, or Advanced")
    estimated_time: str = Field(description="Estimated time to complete (e.g., '2-3 days')")
    steps: list[str] = Field(description="Step-by-step instructions to build the project")
    learning_outcomes: list[str] = Field(description="What skills will be gained")


class CoachRequest(BaseModel):
    """Request model for coach endpoint"""
    verified_skills: list[VerifiedSkill]
    job_description: str


class CoachResponse(BaseModel):
    """Response model for coach endpoint"""
    gap_skill: str
    project_title: str
    description: str
    tech_stack: list[str]
    difficulty: str
    estimated_time: str
    steps: list[str]
    learning_outcomes: list[str]
    analysis: str = Field(description="Brief analysis of the skill gap")


# LLM is initialized via shared llm.py module


# =============================================================================
# Gap Analysis Logic
# =============================================================================

def identify_skill_gaps(
    verified_skills: list[VerifiedSkill], 
    job_description: str
) -> dict[str, Any]:
    """
    Analyze the gap between verified skills and job requirements.
    
    Returns:
        Dictionary with strong_skills, weak_skills, and missing_keywords
    """
    # Categorize existing skills
    strong_skills = [s for s in verified_skills if s.score >= 70]
    weak_skills = [s for s in verified_skills if s.score < 50]
    partial_skills = [s for s in verified_skills if 50 <= s.score < 70]
    
    # Extract skill topics
    all_skill_topics = {s.topic.lower() for s in verified_skills}
    
    return {
        "strong_skills": [s.topic for s in strong_skills],
        "weak_skills": [{"topic": s.topic, "score": s.score} for s in weak_skills],
        "partial_skills": [{"topic": s.topic, "score": s.score} for s in partial_skills],
        "skill_topics": list(all_skill_topics),
        "total_verified": len([s for s in verified_skills if s.status == "Verified"]),
        "total_partial": len([s for s in verified_skills if s.status == "Partially Verified"]),
        "total_unverified": len([s for s in verified_skills if s.status == "Unverified"]),
    }


# =============================================================================
# Bridge Project Generator
# =============================================================================

async def generate_bridge_project(
    verified_skills: list[VerifiedSkill],
    job_description: str
) -> CoachResponse:
    """
    Generate a bridge project to help close the gap between current skills and job requirements.
    
    Args:
        verified_skills: List of skills with verification scores
        job_description: Target job description text
        
    Returns:
        CoachResponse with project details
    """
    llm = get_llm_model(temperature=0.3)  # Lower temp → more precise, less hallucination
    
    # Analyze skill gaps
    gap_analysis = identify_skill_gaps(verified_skills, job_description)
    
    system_prompt = """You are a senior engineering career coach specialising in technical skill-gap analysis.

TASK:
1. Read the candidate's FULL verified skill profile (with percentage scores from real code analysis).
2. Read the target job description and infer the seniority level and specialisation.
3. Identify the SINGLE most impactful skill gap: a technology explicitly required by the JD that is either
   completely missing from the candidate's profile OR has a low verification score (< 60%).
4. Design a focused, non-trivial portfolio project that directly demonstrates that skill.

CRITICAL RULES — violating these will make your output useless:
- NEVER suggest Python basics, data structures, or introductory ML if the candidate already knows Python/ML (score >= 60%).
- NEVER pick a skill the candidate already excels at (score >= 70%).
- The project difficulty MUST match the seniority level implied by the JD (use Intermediate or Advanced).
- The project MUST showcase the missing/weak skill as its core feature, not a side note.
- Steps must be concrete engineering tasks (not "learn about X", "understand Y").

Return ONLY valid JSON (no markdown, no preamble):
{
    "gap_skill": "Specific technology or concept name from the JD",
    "project_title": "Memorable, descriptive project title",
    "description": "2-3 sentences: what the project does and why it demonstrates the gap skill",
    "tech_stack": ["primary_tech", "supporting_tech2", "supporting_tech3"],
    "difficulty": "Intermediate|Advanced",
    "estimated_time": "e.g., 4-6 days",
    "steps": [
        "Step 1: concrete engineering action",
        "Step 2: concrete engineering action",
        "Step 3: concrete engineering action",
        "Step 4: concrete engineering action",
        "Step 5: concrete engineering action",
        "Step 6: deploy or demo the project"
    ],
    "learning_outcomes": [
        "Specific technical outcome 1",
        "Specific technical outcome 2",
        "Specific technical outcome 3"
    ],
    "analysis": "1-2 sentences: why THIS gap was chosen and how closing it impacts the candidate's chances"
}"""

    # Build rich skill context with all individual scores
    all_skills_lines = "\n".join(
        f"  - {s.topic}: {s.score}% ({s.status})"
        for s in verified_skills
    ) or "  (no skills verified yet)"

    human_prompt = f"""CANDIDATE VERIFIED SKILL PROFILE (from real code analysis — scores are reliable):
{all_skills_lines}

SUMMARY:
- Strong (>= 70%): {', '.join(gap_analysis['strong_skills']) or 'None'}
- Partial (50-69%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['partial_skills']]) or 'None'}
- Weak (< 50%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['weak_skills']]) or 'None'}

TARGET JOB DESCRIPTION:
---
{job_description[:3000]}
---

Identify the #1 highest-impact skill gap between this candidate and the role.
Design a specific, non-trivial bridge project that directly fills that gap.
Return ONLY valid JSON, no markdown or explanation outside the JSON."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])
        
        response_text = response.content
        project_data = parse_json_response(response_text)
        
        return CoachResponse(
            gap_skill=project_data.get("gap_skill", "Unknown"),
            project_title=project_data.get("project_title", "Bridge Project"),
            description=project_data.get("description", ""),
            tech_stack=project_data.get("tech_stack", []),
            difficulty=project_data.get("difficulty", "Intermediate"),
            estimated_time=project_data.get("estimated_time", "1 week"),
            steps=project_data.get("steps", []),
            learning_outcomes=project_data.get("learning_outcomes", []),
            analysis=project_data.get("analysis", "")
        )
        
    except ValueError as e:
        raise ValueError(str(e))
    except Exception as e:
        raise ValueError(f"Coach generation failed: {e}")


# =============================================================================
# Quick Project Suggestions (No LLM, keyword-based)
# =============================================================================

SKILL_PROJECT_TEMPLATES = {
    "docker": {
        "project_title": "Containerize Your Portfolio App",
        "description": "Package your application with Docker and deploy to a cloud platform.",
        "tech_stack": ["Docker", "Docker Compose", "GitHub Actions"],
        "difficulty": "Intermediate",
        "estimated_time": "2-3 days",
        "steps": [
            "Create a Dockerfile for your existing project",
            "Set up a docker-compose.yml for local development",
            "Add a .dockerignore file to optimize builds",
            "Create a multi-stage build for production",
            "Set up GitHub Actions to build and push images",
            "Deploy to a cloud platform (Railway, Fly.io, or AWS ECS)"
        ],
        "learning_outcomes": [
            "Understand containerization concepts",
            "Write production-ready Dockerfiles",
            "Use Docker Compose for multi-service apps",
            "Implement CI/CD with container workflows"
        ]
    },
    "kubernetes": {
        "project_title": "Deploy a Microservice on K8s",
        "description": "Deploy a simple microservice architecture using Kubernetes.",
        "tech_stack": ["Kubernetes", "kubectl", "Helm", "Minikube"],
        "difficulty": "Advanced",
        "estimated_time": "1 week",
        "steps": [
            "Set up Minikube or use a cloud K8s cluster",
            "Create Deployment and Service manifests",
            "Implement ConfigMaps and Secrets",
            "Set up horizontal pod autoscaling",
            "Create a Helm chart for your application",
            "Implement health checks and rolling updates"
        ],
        "learning_outcomes": [
            "Understand Kubernetes architecture",
            "Write and manage K8s manifests",
            "Use Helm for package management",
            "Implement production-ready deployments"
        ]
    },
    "graphql": {
        "project_title": "Build a GraphQL API Gateway",
        "description": "Create a GraphQL API that aggregates multiple data sources.",
        "tech_stack": ["GraphQL", "Apollo Server", "Node.js", "TypeScript"],
        "difficulty": "Intermediate",
        "estimated_time": "3-4 days",
        "steps": [
            "Set up Apollo Server with TypeScript",
            "Define a schema with types, queries, and mutations",
            "Implement resolvers with data loaders",
            "Add authentication with context",
            "Implement subscription for real-time updates",
            "Add error handling and validation"
        ],
        "learning_outcomes": [
            "Design GraphQL schemas",
            "Implement efficient data fetching",
            "Handle authentication in GraphQL",
            "Build real-time features with subscriptions"
        ]
    }
}


def get_template_project(skill: str) -> Optional[dict[str, Any]]:
    """Get a pre-defined project template for common skills."""
    skill_lower = skill.lower()
    for key, template in SKILL_PROJECT_TEMPLATES.items():
        if key in skill_lower:
            return {"gap_skill": skill, **template, "analysis": f"'{skill}' was identified as a missing skill in the job requirements."}
    return None

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
    llm = get_llm_model(temperature=0.7)  # Higher for creative project ideas
    
    # Analyze skill gaps
    gap_analysis = identify_skill_gaps(verified_skills, job_description)
    
    system_prompt = """You are an expert career coach and technical mentor. Your task is to:
1. Analyze the gap between a candidate's verified skills and a job description
2. Identify the MOST CRITICAL missing or weak skill
3. Design a practical mini-project that will help them build this skill

Focus on:
- Skills explicitly mentioned in the job description that the candidate lacks
- Skills where the candidate has low verification scores (< 50%)
- Technologies that are core requirements, not nice-to-haves

The project should be:
- Achievable in 1-2 weeks for a motivated learner
- Practical and portfolio-worthy
- Directly relevant to the job they're targeting

Return your response as valid JSON matching this exact structure:
{
    "gap_skill": "The identified missing/weak skill",
    "project_title": "A catchy, memorable project title",
    "description": "2-3 sentence description of what the project does",
    "tech_stack": ["tech1", "tech2", "tech3"],
    "difficulty": "Beginner|Intermediate|Advanced",
    "estimated_time": "e.g., 3-5 days",
    "steps": [
        "Step 1: Detailed instruction",
        "Step 2: Detailed instruction",
        "Step 3: Detailed instruction",
        "Step 4: Detailed instruction",
        "Step 5: Detailed instruction"
    ],
    "learning_outcomes": [
        "What they will learn 1",
        "What they will learn 2",
        "What they will learn 3"
    ],
    "analysis": "Brief explanation of why this skill gap was prioritized"
}"""

    # Build the analysis context
    skills_summary = f"""
CANDIDATE'S VERIFIED SKILLS:
- Strong skills (score >= 70%): {', '.join(gap_analysis['strong_skills']) or 'None'}
- Partial skills (50-69%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['partial_skills']]) or 'None'}
- Weak skills (< 50%): {', '.join([f"{s['topic']} ({s['score']}%)" for s in gap_analysis['weak_skills']]) or 'None'}

Summary: {gap_analysis['total_verified']} verified, {gap_analysis['total_partial']} partial, {gap_analysis['total_unverified']} unverified
"""

    human_prompt = f"""{skills_summary}

TARGET JOB DESCRIPTION:
---
{job_description}
---

Analyze the gap and generate ONE bridge project to address the most critical missing skill.
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

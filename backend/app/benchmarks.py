"""
Industry Skill Benchmarks
Provides pre-seeded benchmark profiles for common engineering roles.
Used by the Skill Radar chart to overlay "industry average" traces.
"""

from typing import Any
from .llm import get_llm_model, parse_json_response
from langchain_core.messages import HumanMessage, SystemMessage


# =============================================================================
# Pre-seeded benchmarks for common roles (domain → expected score 0-100)
# Scores represent "how important / how much evidence expected" for that role
# =============================================================================

ROLE_BENCHMARKS: dict[str, dict[str, int]] = {
    "software_engineer": {
        "Python": 75, "Web Development": 70, "API": 75, "Database": 65,
        "Testing": 60, "DevOps": 50, "Authentication": 55, "Frontend": 55,
        "Backend": 75, "Cloud": 45,
    },
    "senior_software_engineer": {
        "Python": 85, "Web Development": 75, "API": 85, "Database": 75,
        "Testing": 70, "DevOps": 65, "Authentication": 65, "Frontend": 60,
        "Backend": 85, "Cloud": 60,
    },
    "data_scientist": {
        "Machine Learning": 85, "Python": 85, "Data Science": 90,
        "Deep Learning": 65, "Natural Language Processing": 60,
        "Database": 55, "API": 45, "Cloud": 50, "Testing": 40, "Web Development": 30,
    },
    "ml_engineer": {
        "Machine Learning": 90, "Deep Learning": 80, "Python": 90,
        "Data Science": 75, "Cloud": 70, "DevOps": 65,
        "API": 65, "Database": 55, "Natural Language Processing": 60, "Testing": 55,
    },
    "data_engineer": {
        "Data Engineering": 90, "Database": 85, "Python": 80, "Cloud": 75,
        "DevOps": 65, "API": 55, "Machine Learning": 40, "Testing": 60,
        "Backend": 60, "Web Development": 25,
    },
    "frontend_engineer": {
        "Frontend": 90, "Web Development": 85, "API": 65, "Testing": 60,
        "Authentication": 55, "Backend": 35, "Database": 30, "Cloud": 40,
        "DevOps": 35, "Python": 20,
    },
    "fullstack_engineer": {
        "Frontend": 75, "Backend": 80, "Web Development": 85, "API": 80,
        "Database": 70, "Authentication": 65, "Testing": 65, "Cloud": 55,
        "DevOps": 55, "Python": 65,
    },
    "devops_engineer": {
        "DevOps": 90, "Cloud": 85, "Backend": 60, "Database": 55,
        "API": 60, "Testing": 65, "Authentication": 55, "Python": 60,
        "Web Development": 35, "Machine Learning": 20,
    },
    "backend_engineer": {
        "Backend": 90, "API": 85, "Database": 80, "Authentication": 70,
        "Testing": 70, "Python": 75, "Cloud": 60, "DevOps": 55,
        "Web Development": 40, "Frontend": 25,
    },
    "nlp_engineer": {
        "Natural Language Processing": 90, "Machine Learning": 80,
        "Deep Learning": 75, "Python": 90, "Data Science": 65,
        "API": 60, "Cloud": 55, "Database": 45, "Testing": 50, "Web Development": 30,
    },
}

# Human-readable aliases for URL slugs
ROLE_ALIASES: dict[str, str] = {
    "software-engineer": "software_engineer",
    "swe": "software_engineer",
    "senior-software-engineer": "senior_software_engineer",
    "senior-swe": "senior_software_engineer",
    "data-scientist": "data_scientist",
    "ds": "data_scientist",
    "ml-engineer": "ml_engineer",
    "mle": "ml_engineer",
    "data-engineer": "data_engineer",
    "de": "data_engineer",
    "frontend-engineer": "frontend_engineer",
    "frontend": "frontend_engineer",
    "fullstack-engineer": "fullstack_engineer",
    "fullstack": "fullstack_engineer",
    "devops-engineer": "devops_engineer",
    "devops": "devops_engineer",
    "backend-engineer": "backend_engineer",
    "backend": "backend_engineer",
    "nlp-engineer": "nlp_engineer",
    "nlp": "nlp_engineer",
}


def get_benchmark(role_slug: str) -> dict[str, Any]:
    """
    Return benchmark scores for a given role slug.
    Falls back to LLM generation for unknown roles.
    """
    # Normalise
    normalised = role_slug.lower().strip().replace(" ", "-")
    canonical = ROLE_ALIASES.get(normalised, normalised.replace("-", "_"))
    scores = ROLE_BENCHMARKS.get(canonical)

    if scores:
        return {
            "role": canonical,
            "role_display": canonical.replace("_", " ").title(),
            "scores": scores,
            "source": "seeded",
        }
    return {
        "role": canonical,
        "role_display": canonical.replace("_", " ").title(),
        "scores": {},
        "source": "not_found",
    }


async def get_benchmark_llm(role_description: str, skill_topics: list[str]) -> dict[str, Any]:
    """
    Generate a benchmark for a custom role using the LLM.
    Used when no seeded benchmark matches.

    Args:
        role_description: Free-text role description (e.g. "Senior Generative AI Engineer")
        skill_topics: List of skill domains to score (from the candidate's verified skills)

    Returns:
        Dict with role and scores map
    """
    llm = get_llm_model(temperature=0.2)

    domains = skill_topics[:12] if skill_topics else list(ROLE_BENCHMARKS["software_engineer"].keys())
    domains_str = ", ".join(domains)

    system = """You are a hiring benchmark expert. Given a job role and a list of skill domains,
return a JSON object with expected proficiency scores (0-100) for each domain.
100 = critical core requirement, 0 = not relevant at all.
Return ONLY valid JSON: {"scores": {"DomainName": score, ...}}"""

    human = f"""Role: {role_description}
Skill domains to score: {domains_str}
Return the JSON with a score (0-100) for each domain."""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=human)
        ])
        data = parse_json_response(response.content)
        scores = data.get("scores", {})
        # Clamp values
        scores = {k: max(0, min(100, int(v))) for k, v in scores.items() if k in skill_topics}
        return {
            "role": role_description,
            "role_display": role_description,
            "scores": scores,
            "source": "llm",
        }
    except Exception as e:
        return {
            "role": role_description,
            "role_display": role_description,
            "scores": {d: 60 for d in domains},  # neutral fallback
            "source": "fallback",
            "error": str(e),
        }


def list_available_roles() -> list[dict[str, str]]:
    """Return all available seeded role benchmarks."""
    return [
        {
            "slug": key.replace("_", "-"),
            "display": key.replace("_", " ").title(),
        }
        for key in ROLE_BENCHMARKS.keys()
    ]

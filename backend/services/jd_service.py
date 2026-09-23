import json
from functools import lru_cache
from pathlib import Path

from groq import AsyncGroq

from backend.models.jd import (
    JDAnalysis,
    JDRequirements,
)
from backend.services.llm_service import (
    get_client,
    load_profile,
)


BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_NAME = __import__("os").getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-120b",
)


MAX_JD_ANALYSIS_CHARS = 16000


@lru_cache(maxsize=1)
def build_jd_system_prompt() -> str:
    return """
You are the JD Analysis engine for Prajwal AI.

Your job is to analyze a job description and compare its
requirements with Prajwal's documented professional profile.

You must be factual and evidence-based.

Never invent experience, skills, technologies, education,
responsibilities, certifications, or years of experience.

Distinguish between:

- professional/internship experience
- project experience
- current focus
- future learning

Do not treat future learning as established expertise.

Do not overstate compatibility.

When something is not documented, consider it a gap or
undocumented requirement rather than assuming it exists.

Keep the output concise.

For required skills:
- classify as a strong match only when the profile clearly
  documents relevant experience.
- classify as partial when there is related exposure but the
  requirement is not fully supported.
- classify as a gap when there is no supporting evidence.

Do not invent a numeric match percentage.

Return only the requested structured output.
""".strip()


@lru_cache(maxsize=1)
def load_candidate_context() -> str:
    """
    Build a compact candidate context specifically for JD analysis.

    We intentionally do NOT send the entire profile JSON here.
    Contact details, URLs, and unrelated metadata are not needed
    for skill matching.
    """

    with (BASE_DIR / "data" / "profile.json").open(
        "r",
        encoding="utf-8",
    ) as file:

        profile = json.load(file)

    candidate_context = {
        "education": profile.get("education", {}),

        "professional_experience": [
            {
                "company": item.get("company"),
                "role": item.get("role"),
                "duration": item.get("duration"),
                "internship_project": item.get(
                    "internship_project"
                ),
                "responsibilities": item.get(
                    "responsibilities",
                    [],
                ),
                "technologies_used": item.get(
                    "technologies_used",
                    [],
                ),
            }
            for item in profile.get(
                "experience",
                [],
            )
        ],

        "projects": [
            {
                "name": item.get("name"),
                "category": item.get("category"),
                "description": item.get(
                    "description"
                ),
                "core_features": item.get(
                    "core_features",
                    [],
                ),
                "technologies": item.get(
                    "technologies",
                    [],
                ),
                "internship_context": item.get(
                    "internship_context"
                ),
            }
            for item in profile.get(
                "projects",
                [],
            )
        ],

        "technical_skills": profile.get(
            "technical_skills",
            {},
        ),

        "current_focus": profile.get(
            "current_focus",
            [],
        ),

        "future_learning": profile.get(
            "future_learning",
            [],
        ),
    }

    return json.dumps(
        candidate_context,
        indent=2,
        ensure_ascii=False,
    )


def validate_jd_size(jd_text: str) -> None:
    """
    Protect the current Groq TPM budget.

    Phase 6 intentionally does not silently truncate a JD.
    A future version can add chunking/RAG for very large documents.
    """

    if len(jd_text) > MAX_JD_ANALYSIS_CHARS:
        raise ValueError(
            "This job description is too large for the current "
            "analysis pipeline. Please use a shorter JD for V1."
        )


async def extract_jd_requirements(
    jd_text: str,
) -> JDRequirements:

    validate_jd_size(jd_text)

    client = get_client()

    response = await client.chat.completions.create(
        model=MODEL_NAME,

        messages=[
            {
                "role": "system",
                "content": (
    build_jd_system_prompt()
    + "\n\n"
    "The uploaded document may not actually be a job description.\n"
    "First determine whether the document is a genuine job description "
    "or job posting.\n\n"
    "Set is_job_description to true only when the document clearly "
    "describes a job role, responsibilities, qualifications, skills, "
    "experience requirements, education requirements, or hiring criteria.\n\n"
    "Set is_job_description to false for resumes, CVs, invoices, "
    "certificates, academic documents, or unrelated documents.\n\n"
    "Never assume a document is a job description merely because it "
    "contains technical skills.\n\n"
    "If is_job_description is false, return empty values for all other "
    "requirement fields.\n\n"
    "Then extract only the requirements from the provided job description."
),
            },
            {
                "role": "user",
                "content": (
                    "JOB DESCRIPTION:\n\n"
                    f"{jd_text}"
                ),
            },
        ],

        temperature=0.1,
        max_completion_tokens=512,
        include_reasoning=False,
        reasoning_effort="low",

        response_format={
    "type": "json_schema",
    "json_schema": {
        "name": "jd_requirements",
        "strict": True,
        "schema": JDRequirements.model_json_schema(),
    },
},
    )

    raw_content = (
        response.choices[0]
        .message
        .content
        or "{}"
    )

    try:
        data = json.loads(raw_content)

        requirements = JDRequirements.model_validate(data)

        if not requirements.is_job_description:
            raise ValueError(
                "The uploaded document does not appear to be a job description. "
                "Please upload a valid job posting or job description."
            )

        return requirements

    except ValueError:
        raise

    except Exception as error:

        raise RuntimeError(
            "Failed to validate JD requirements."
        ) from error


async def compare_jd_with_profile(
    requirements: JDRequirements,
    user_message: str | None = None,
) -> JDAnalysis:

    client = get_client()

    candidate_context = load_candidate_context()

    requirements_json = json.dumps(
        requirements.model_dump(),
        indent=2,
        ensure_ascii=False,
    )

    user_instruction = (
        user_message.strip()
        if user_message and user_message.strip()
        else "Provide the complete job-to-profile comparison."
    )

    response = await client.chat.completions.create(
        model=MODEL_NAME,

        messages=[
            {
                "role": "system",
                "content": build_jd_system_prompt(),
            },
            {
    "role": "user",
    "content": (
        "Compare the job requirements with Prajwal's profile.\n\n"
        "RECRUITER REQUEST:\n"
        f"{user_instruction}\n\n"
        "Rules:\n"
        "- Return only the required JSON structure.\n"
        "- Be strictly factual. Never invent experience or skills.\n"
        "- Clearly distinguish professional experience from projects.\n"
        "- Use concise phrases instead of long explanations.\n"
        "- summary must be at most 60 words.\n"
        "- strong_matches: at most 5 items.\n"
        "- partial_matches: at most 5 items.\n"
        "- gaps: at most 5 items.\n"
        "- relevant_projects: at most 5 items.\n"
        "- relevant_experience: at most 3 items.\n\n"
        "JOB REQUIREMENTS:\n\n"
        f"{requirements_json}\n\n"
        "PRAJWAL PROFILE:\n\n"
        f"{json.dumps(candidate_context, ensure_ascii=False)}"
    ),
},
        ],

        temperature=0.1,
        max_completion_tokens=1024,
        include_reasoning=False,
        reasoning_effort="low",

        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "jd_analysis",
                "strict": True,
                "schema": JDAnalysis.model_json_schema(),
            },
        },
    )

    raw_content = (
        response.choices[0]
        .message
        .content
        or "{}"
    )

    try:
        data = json.loads(raw_content)

        return JDAnalysis.model_validate(data)

    except Exception as error:

        raise RuntimeError(
            "Failed to validate JD analysis."
        ) from error
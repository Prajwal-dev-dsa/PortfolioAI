import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from groq import AsyncGroq


load_dotenv()


BASE_DIR = Path(__file__).resolve().parents[1]

PROFILE_PATH = BASE_DIR / "data" / "profile.json"
PROMPT_PATH = BASE_DIR / "prompts" / "system_prompt.txt"


MODEL_NAME = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-120b"
)


@lru_cache(maxsize=1)
def load_profile() -> str:
    """
    Load the portfolio profile once and convert it
    into formatted JSON text for the LLM.
    """

    with PROFILE_PATH.open(
        "r",
        encoding="utf-8"
    ) as file:

        profile = json.load(file)

    return json.dumps(
        profile,
        indent=2,
        ensure_ascii=False
    )


@lru_cache(maxsize=1)
def load_system_prompt() -> str:
    """
    Load the portfolio AI system prompt once.
    """

    with PROMPT_PATH.open(
        "r",
        encoding="utf-8"
    ) as file:

        return file.read().strip()


def build_system_message() -> str:
    """
    Combine instructions and the portfolio knowledge base.
    """

    return f"""
{load_system_prompt()}

========================
PRAJWAL PROFILE
========================

{load_profile()}
""".strip()


def get_client() -> AsyncGroq:
    """
    Create the Groq async client.

    Raises a clear error when the API key is missing.
    """

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not configured."
        )

    return AsyncGroq(api_key=api_key)


async def generate_chat_response(
    message: str,
    history: list[dict[str, str]]
) -> str:

    client = get_client()

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": build_system_message()
        }
    ]

    messages.extend(history[-6:])

    messages.append(
        {
            "role": "user",
            "content": message
        }
    )

    completion = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0.2,
        max_completion_tokens=512,
        include_reasoning=False,
    )

    response = completion.choices[0].message.content

    if not response:
        raise RuntimeError(
            "The LLM returned an empty response."
        )

    return response.strip()


async def stream_chat_response(
    message: str,
    history: list[dict[str, str]]
):
    client = get_client()

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": build_system_message()
        }
    ]

    messages.extend(history[-6:])

    messages.append(
        {
            "role": "user",
            "content": message
        }
    )

    stream = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0.2,
        max_completion_tokens=512,
        include_reasoning=False,
        stream=True,
    )

    async for chunk in stream:

        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta.content

        if delta:
            yield delta
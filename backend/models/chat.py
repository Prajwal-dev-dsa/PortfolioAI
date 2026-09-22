from pydantic import BaseModel, Field
from typing import Literal

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(
        min_length=1,
        max_length=4000
    )


class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=4000
    )

    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20
    )


class ChatResponse(BaseModel):
    response: str
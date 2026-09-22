from fastapi import APIRouter, HTTPException

from backend.models.chat import (
    ChatRequest,
    ChatResponse,
)

from backend.services.llm_service import (
    generate_chat_response,
)


router = APIRouter(
    prefix="/api/chat",
    tags=["Chat"]
)


@router.post(
    "",
    response_model=ChatResponse
)
async def chat(
    request: ChatRequest
) -> ChatResponse:

    try:

        history = [
            {
                "role": item.role,
                "content": item.content,
            }
            for item in request.history
        ]

        response = await generate_chat_response(
            message=request.message,
            history=history,
        )

        return ChatResponse(
            response=response
        )

    except RuntimeError as error:

        print(f"[CHAT ERROR] {error}")

        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error

    except Exception as error:

        print(f"[CHAT ERROR] {type(error).__name__}: {error}")

        raise HTTPException(
            status_code=500,
            detail=f"{type(error).__name__}: {error}",
        ) from error
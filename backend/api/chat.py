from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.models.chat import (
    ChatRequest,
    ChatResponse,
)

from backend.services.llm_service import (
    generate_chat_response,
    stream_chat_response,
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


@router.post("/stream")
async def stream_chat(
    request: ChatRequest
):
    try:

        history = [
            {
                "role": item.role,
                "content": item.content,
            }
            for item in request.history
        ]

        async def event_generator():
            try:
                async for chunk in stream_chat_response(
                    message=request.message,
                    history=history,
                ):
                    yield chunk

            except Exception as error:
                print(
                    f"[STREAM ERROR] {type(error).__name__}: {error}"
                )

                yield "\n\n[STREAM_ERROR]"

        return StreamingResponse(
            event_generator(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    except RuntimeError as error:

        print(f"[STREAM ERROR] {error}")

        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error

    except Exception as error:

        print(
            f"[STREAM ERROR] {type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=502,
            detail="Failed to start AI response stream.",
        ) from error
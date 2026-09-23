import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.models.chat import (
    ChatRequest,
    ChatResponse,
)

from backend.services.llm_service import (
    generate_chat_response,
    stream_chat_response,
)

from backend.services.rate_limiter import (
    enforce_rate_limit,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["Chat"],
)


def _get_client_id(request: Request) -> str:
    """
    Identify the caller for the in-memory V1 rate limiter.

    Keep this intentionally simple for V1. In production behind a
    trusted proxy, client identity can be adapted to the deployment.
    """
    if request.client:
        return request.client.host

    return "unknown"


def _enforce_chat_rate_limit(request: Request) -> None:
    client_id = _get_client_id(request)

    try:
        enforce_rate_limit(
            client_id=client_id,
            bucket="chat",
            max_requests=20,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
        ) from error


@router.post(
    "",
    response_model=ChatResponse,
)
async def chat(
    request: Request,
    payload: ChatRequest,
) -> ChatResponse:

    _enforce_chat_rate_limit(request)

    try:
        history = [
            {
                "role": item.role,
                "content": item.content,
            }
            for item in payload.history
        ]

        response = await generate_chat_response(
            message=payload.message,
            history=history,
        )

        return ChatResponse(
            response=response,
        )

    except RuntimeError as error:
        logger.exception(
            "[CHAT ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=500,
            detail="The AI service could not complete the request.",
        ) from error

    except Exception as error:
        logger.exception(
            "[CHAT ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Unable to generate an AI response right now.",
        ) from error


@router.post("/stream")
async def stream_chat(
    request: Request,
    payload: ChatRequest,
):
    _enforce_chat_rate_limit(request)

    try:
        history = [
            {
                "role": item.role,
                "content": item.content,
            }
            for item in payload.history
        ]

        async def event_generator():
            try:
                async for chunk in stream_chat_response(
                    message=payload.message,
                    history=history,
                ):
                    if chunk:
                        yield chunk

            except Exception as error:
                logger.exception(
                    "[STREAM ERROR] %s",
                    type(error).__name__,
                )

                # The HTTP response has already started, so we cannot
                # change the status code here. Do not leak internal
                # exception details to the client.
                yield (
                    "\n\n"
                    "Sorry, the AI response was interrupted. "
                    "Please try again."
                )

        return StreamingResponse(
            event_generator(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except RuntimeError as error:
        logger.exception(
            "[STREAM ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=500,
            detail="The AI service could not start the stream.",
        ) from error

    except Exception as error:
        logger.exception(
            "[STREAM ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Failed to start AI response stream.",
        ) from error

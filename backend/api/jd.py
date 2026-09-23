import logging
from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)

from backend.models.jd import (
    ParsedDocument,
    JDAnalysis,
)

from backend.parsers.docx_parser import (
    extract_docx_text,
)

from backend.parsers.pdf_parser import (
    extract_pdf_text,
)

from backend.parsers.txt_parser import (
    extract_txt_text,
)

from backend.services.jd_service import (
    compare_jd_with_profile,
    extract_jd_requirements,
)

from backend.services.rate_limiter import (
    enforce_rate_limit,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/jd",
    tags=["Job Description"],
)


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _get_client_id(request: Request) -> str:
    if request.client:
        return request.client.host

    return "unknown"


def _enforce_rate_limit(
    request: Request,
    bucket: str,
    max_requests: int,
) -> None:
    client_id = _get_client_id(request)

    try:
        enforce_rate_limit(
            client_id=client_id,
            bucket=bucket,
            max_requests=max_requests,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
        ) from error


def _validate_file_signature(
    contents: bytes,
    extension: str,
) -> None:
    """
    Lightweight content-signature checks.

    This does not replace real parsing; it only catches obvious
    extension/content mismatches early.
    """
    if extension == ".pdf":
        if not contents.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=422,
                detail="The uploaded PDF appears to be invalid.",
            )

    elif extension == ".docx":
        # DOCX is a ZIP-based Open XML package.
        if not contents.startswith(b"PK"):
            raise HTTPException(
                status_code=422,
                detail="The uploaded DOCX appears to be invalid.",
            )


def _read_and_validate_file(
    file: UploadFile,
) -> tuple[str, bytes]:
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. "
                "Only PDF, DOCX, and TXT files are allowed."
            ),
        )

    # The endpoint already uses UploadFile, but reading the complete
    # body still gives us a deterministic size check for V1.
    import asyncio

    try:
        contents = asyncio.run(file.read())
    except RuntimeError:
        # `asyncio.run()` should not be used inside FastAPI's event loop.
        # This branch exists only to make accidental reuse obvious.
        raise HTTPException(
            status_code=500,
            detail="Unable to read the uploaded file.",
        )

    return extension, contents


async def _read_file(
    file: UploadFile,
) -> tuple[str, str, bytes]:
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. "
                "Only PDF, DOCX, and TXT files are allowed."
            ),
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum size is 10 MB.",
        )

    _validate_file_signature(
        contents,
        extension,
    )

    return filename, extension, contents


def _extract_text(
    contents: bytes,
    extension: str,
) -> str:
    file_stream = BytesIO(contents)

    try:
        if extension == ".pdf":
            extracted_text = extract_pdf_text(
                file_stream
            )

        elif extension == ".docx":
            extracted_text = extract_docx_text(
                file_stream
            )

        else:
            extracted_text = extract_txt_text(
                file_stream
            )

    except Exception as error:
        logger.exception(
            "[JD PARSE ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=422,
            detail=(
                "The file could not be parsed. "
                "Please make sure it is a valid "
                "PDF, DOCX, or TXT file."
            ),
        ) from error

    extracted_text = (extracted_text or "").strip()

    if not extracted_text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable text could be extracted "
                "from this document."
            ),
        )

    return extracted_text


@router.post(
    "/parse",
    response_model=ParsedDocument,
)
async def parse_job_description(
    request: Request,
    file: Annotated[
        UploadFile,
        File(description="Job description file"),
    ],
) -> ParsedDocument:

    _enforce_rate_limit(
        request,
        bucket="jd-parse",
        max_requests=20,
    )

    filename, extension, contents = await _read_file(
        file
    )

    extracted_text = _extract_text(
        contents,
        extension,
    )

    return ParsedDocument(
        filename=filename,
        file_type=extension.lstrip(".").upper(),
        character_count=len(extracted_text),
        text=extracted_text,
    )


@router.post(
    "/analyze",
    response_model=JDAnalysis,
)
async def analyze_job_description(
    request: Request,
    file: Annotated[
        UploadFile,
        File(description="Job description file"),
    ],
    message: Annotated[
        str | None,
        Form(),
    ] = None,
) -> JDAnalysis:

    _enforce_rate_limit(
        request,
        bucket="jd-analysis",
        max_requests=10,
    )

    filename, extension, contents = await _read_file(
        file
    )

    extracted_text = _extract_text(
        contents,
        extension,
    )

    try:
        logger.info(
            "[JD ANALYZE] Extracting requirements for file=%s",
            filename,
        )

        requirements = await extract_jd_requirements(
            extracted_text
        )

        logger.info(
            "[JD ANALYZE] Requirement extraction successful."
        )

        logger.info(
            "[JD ANALYZE] Comparing with profile."
        )

        analysis = await compare_jd_with_profile(
            requirements,
            user_message=message,
        )

        logger.info(
            "[JD ANALYZE] Profile comparison successful."
        )

        return analysis

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except RuntimeError as error:
        logger.exception(
            "[JD ANALYZE ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=500,
            detail="JD analysis failed. Please try again.",
        ) from error

    except Exception as error:
        logger.exception(
            "[JD ANALYZE ERROR] %s",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail="Unable to analyze the job description.",
        ) from error

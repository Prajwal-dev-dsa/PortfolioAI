from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
)

from backend.models.jd import ParsedDocument

from backend.parsers.docx_parser import (
    extract_docx_text,
)

from backend.parsers.pdf_parser import (
    extract_pdf_text,
)

from backend.parsers.txt_parser import (
    extract_txt_text,
)


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


@router.post(
    "/parse",
    response_model=ParsedDocument,
)
async def parse_job_description(
    file: Annotated[
        UploadFile,
        File(description="Job description file"),
    ],
) -> ParsedDocument:

    filename = file.filename or ""

    extension = Path(filename).suffix.lower()

    # ---------------------------------------------------------
    # File type validation
    # ---------------------------------------------------------

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. "
                "Only PDF, DOCX, and TXT files are allowed."
            ),
        )

    # ---------------------------------------------------------
    # Read file
    # ---------------------------------------------------------

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

    # ---------------------------------------------------------
    # Reset file pointer so parsers can read from the start.
    # ---------------------------------------------------------

    from io import BytesIO

    file_stream = BytesIO(contents)

    # ---------------------------------------------------------
    # Select parser
    # ---------------------------------------------------------

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

        print(
            f"[JD PARSE ERROR] "
            f"{type(error).__name__}: {error}"
        )

        raise HTTPException(
            status_code=422,
            detail=(
                "The file could not be parsed. "
                "Please make sure it is a valid "
                "PDF, DOCX, or TXT file."
            ),
        ) from error

    # ---------------------------------------------------------
    # Make sure extraction actually produced text.
    # ---------------------------------------------------------

    if not extracted_text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable text could be extracted "
                "from this document."
            ),
        )

    return ParsedDocument(
        filename=filename,
        file_type=extension.lstrip(".").upper(),
        character_count=len(extracted_text),
        text=extracted_text,
    )
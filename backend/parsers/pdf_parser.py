from pypdf import PdfReader

MAX_PDF_PAGES = 50

def extract_pdf_text(file_stream) -> str:
    reader = PdfReader(file_stream)

    if len(reader.pages) > MAX_PDF_PAGES:
        raise ValueError(
            "PDF contains too many pages. "
            f"Maximum allowed is {MAX_PDF_PAGES} pages."
        )

    pages = []

    for page in reader.pages:
        text = page.extract_text(
            extraction_mode="layout"
        )

        if text:
            pages.append(text)

    return "\n\n".join(pages).strip()
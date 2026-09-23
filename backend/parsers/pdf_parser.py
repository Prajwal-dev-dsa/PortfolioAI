from pypdf import PdfReader


def extract_pdf_text(file) -> str:
    """
    Extract text from all pages of a PDF.

    The parser preserves useful line structure by using
    pypdf's layout extraction mode.
    """

    reader = PdfReader(file)

    extracted_pages = []

    for page in reader.pages:
        text = page.extract_text(
            extraction_mode="layout"
        )

        if text:
            extracted_pages.append(text)

    return "\n\n".join(extracted_pages).strip()
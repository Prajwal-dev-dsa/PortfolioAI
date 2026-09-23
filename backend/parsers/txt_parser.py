def extract_txt_text(file) -> str:
    """
    Extract UTF-8 text from a TXT file.
    """

    content = file.read()

    return content.decode(
        "utf-8",
        errors="replace"
    ).strip()
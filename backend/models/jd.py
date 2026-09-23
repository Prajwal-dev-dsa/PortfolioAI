from pydantic import BaseModel


class ParsedDocument(BaseModel):
    filename: str
    file_type: str
    character_count: int
    text: str
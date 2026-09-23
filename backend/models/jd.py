from typing import Literal
from pydantic import BaseModel, ConfigDict


class ParsedDocument(BaseModel):
    filename: str
    file_type: str
    character_count: int
    text: str


class JDRequirements(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_job_description: bool
    responsibilities: list[str]
    job_title: str
    required_skills: list[str]
    preferred_skills: list[str]
    experience_requirement: str
    education_requirement: str
    other_requirements: list[str]


class JDAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    overall_alignment: Literal["strong", "moderate", "limited"]
    summary: str
    strong_matches: list[str]
    partial_matches: list[str]
    gaps: list[str]
    relevant_projects: list[str]
    relevant_experience: list[str]
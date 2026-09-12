from pydantic import BaseModel


class TranscriptWord(BaseModel):
    word: str
    start: float
    end: float


class TranscriptResponse(BaseModel):
    text: str
    words: list[TranscriptWord]

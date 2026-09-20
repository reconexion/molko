from pydantic import BaseModel, Field


class GoogleSessionRequest(BaseModel):
    code: str = Field(max_length=256)

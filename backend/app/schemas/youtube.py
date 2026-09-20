from pydantic import BaseModel


class YoutubeDownloadRequest(BaseModel):
    url: str
    quality: str = "1080p"
    audio_lang: str = "original"
    start_time: str | None = None
    end_time: str | None = None


class YoutubeStatusResponse(BaseModel):
    status: str
    progress: float
    error: str | None
    error_code: str | None = None
    title: str | None

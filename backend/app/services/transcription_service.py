import httpx

from app.core.config import settings

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


class TranscriptionError(Exception):
    pass


async def transcribe_audio(audio_bytes: bytes, content_type: str, language: str = "es") -> dict:
    if not settings.deepgram_api_key:
        raise TranscriptionError("DEEPGRAM_API_KEY no está configurada en el backend")

    params = {
        "model": "nova-2",
        "smart_format": "true",
        "punctuate": "true",
        "language": language,
    }
    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": content_type or "audio/webm",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(DEEPGRAM_URL, params=params, headers=headers, content=audio_bytes)

    if response.status_code != 200:
        raise TranscriptionError(f"Deepgram error {response.status_code}: {response.text}")

    data = response.json()
    try:
        alternative = data["results"]["channels"][0]["alternatives"][0]
    except (KeyError, IndexError) as exc:
        raise TranscriptionError("Respuesta inesperada de Deepgram") from exc

    words = [
        {"word": w.get("punctuated_word", w["word"]), "start": w["start"], "end": w["end"]}
        for w in alternative.get("words", [])
    ]

    return {"text": alternative.get("transcript", ""), "words": words}

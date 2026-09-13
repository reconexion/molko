const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptResponse {
  text: string;
  words: TranscriptWord[];
}

export const transcriptionApi = {
  transcribe: (audio: Blob, language = "es") => {
    const form = new FormData();
    form.append("audio", audio, "audio.webm");
    return request<TranscriptResponse>(`/transcription?language=${language}`, {
      method: "POST",
      body: form,
    });
  },
};

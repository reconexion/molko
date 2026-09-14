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

async function readErrorDetail(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const data = await res.json();
    detail = data.detail ?? detail;
  } catch {
    // ignore non-JSON error bodies
  }
  return detail;
}

interface TranscodeStatus {
  status: "running" | "done" | "error";
  progress: number;
  error: string | null;
}

const TRANSCODE_POLL_INTERVAL_MS = 500;

export const transcodeApi = {
  // Sends a video the browser's ffmpeg.wasm can't decode (e.g. AV1) to the
  // local backend, which re-encodes it with the system's ffmpeg. The backend
  // runs this as a background job (a full-clip re-encode can take minutes)
  // instead of blocking one request, so this starts the job then polls its
  // status until it's done, reporting real progress along the way instead of
  // leaving the caller with no feedback for the whole conversion.
  transcode: async (video: File, onProgress?: (ratio: number) => void): Promise<Blob> => {
    const form = new FormData();
    form.append("video", video, video.name);

    const startRes = await fetch(`${API_URL}/transcode`, { method: "POST", body: form });
    if (!startRes.ok) throw new ApiError(startRes.status, await readErrorDetail(startRes));
    const { job_id: jobId } = (await startRes.json()) as { job_id: string };

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, TRANSCODE_POLL_INTERVAL_MS));

      const statusRes = await fetch(`${API_URL}/transcode/${jobId}`);
      if (!statusRes.ok) throw new ApiError(statusRes.status, await readErrorDetail(statusRes));
      const job = (await statusRes.json()) as TranscodeStatus;

      if (job.status === "error") throw new ApiError(502, job.error ?? "La conversión falló");
      onProgress?.(job.progress);
      if (job.status === "done") break;
    }

    const fileRes = await fetch(`${API_URL}/transcode/${jobId}/file`);
    if (!fileRes.ok) throw new ApiError(fileRes.status, await readErrorDetail(fileRes));
    return fileRes.blob();
  },
};

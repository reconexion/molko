import { t, translateOrNull, type MessageParams } from "../i18n";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "molko_token";

// localStorage puede lanzar (modo privado, datos bloqueados): la sesión simplemente no persiste.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sin persistencia: la sesión dura lo que dure la pestaña
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nada que limpiar
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  // El servidor manda un `code` estable y el texto vive en el frontend (i18n): se
  // traduce al idioma activo, y solo si no hay traducción se usa el mensaje de respaldo.
  constructor(status: number, message: string, code?: string, params?: MessageParams) {
    super((code && translateOrNull(`errors.${code}`, params)) || message);
    this.status = status;
    this.code = code;
  }
}

interface AuthFailureHandlers {
  onUnauthorized?: () => void;
  onPaymentRequired?: () => void;
}

let handlers: AuthFailureHandlers = {};

// El AuthProvider se registra aquí para reaccionar a una sesión vencida (401) o a
// una suscripción perdida a mitad de uso (402) sin que cada llamada lo maneje.
export function setAuthFailureHandlers(next: AuthFailureHandlers): void {
  handlers = next;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && token) handlers.onUnauthorized?.();
  if (res.status === 402) handlers.onPaymentRequired?.();
  return res;
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  try {
    const { detail } = await res.json();
    if (typeof detail === "string") return new ApiError(res.status, detail);
    if (Array.isArray(detail)) return new ApiError(res.status, t("errors.validation"));
    if (detail && typeof detail === "object") {
      return new ApiError(res.status, detail.message ?? res.statusText, detail.code, detail.params);
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return new ApiError(res.status, res.statusText);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await apiFetch(path, { ...options, headers });
  if (!res.ok) throw await errorFromResponse(res);

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SubscriptionInfo {
  plan: "monthly" | "annual" | null;
  status: string;
  current_period_end: string | null;
  is_active: boolean;
  manageable: boolean;
}

export interface YoutubeUsage {
  enabled: boolean;
  used: number;
  limit: number;
}

export interface UserResponse {
  id: number;
  email: string;
  name: string | null;
  /** false cuando la cuenta aceptó una versión anterior de los términos. */
  terms_accepted: boolean;
  subscription: SubscriptionInfo | null;
  youtube: YoutubeUsage;
}

/** Dirección que inicia el inicio de sesión con Google: es una navegación de página completa, no un fetch. */
export function googleStartUrl(language: string): string {
  return `${API_URL}/auth/google/start?${new URLSearchParams({ language, terms: "true" })}`;
}

export const authApi = {
  config: () => request<{ signups_open: boolean; google_enabled: boolean }>("/auth/config"),
  // Canjea el código de un solo uso con el que el servidor regresa de Google (el token nunca viaja en la URL).
  googleSession: (code: string) =>
    request<{ access_token: string }>("/auth/google/session", { method: "POST", body: JSON.stringify({ code }) }),
  register: (email: string, password: string, name: string, acceptTerms: boolean, language: string) =>
    request<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name: name.trim() || null, accept_terms: acceptTerms, language }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<UserResponse>("/auth/me"),
  updateProfile: (name: string) =>
    request<UserResponse>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: name.trim() || null }) }),
  acceptTerms: () => request<UserResponse>("/auth/accept-terms", { method: "POST" }),
  // Revoca en el servidor todos los tokens de la cuenta (no solo el de este navegador).
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};

export const waitlistApi = {
  join: (email: string) => request<{ joined: boolean }>("/waitlist", { method: "POST", body: JSON.stringify({ email }) }),
};

export type BillingPlan = "monthly" | "annual";

export const billingApi = {
  createCheckoutSession: (plan: BillingPlan) =>
    request<{ checkout_url: string }>("/billing/checkout-session", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  createPortalSession: () => request<{ portal_url: string }>("/billing/portal-session", { method: "POST" }),
};

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

interface TranscodeStatus {
  status: "running" | "done" | "error";
  progress: number;
  error: string | null;
  error_code: string | null;
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

    const startRes = await apiFetch("/transcode", { method: "POST", body: form });
    if (!startRes.ok) throw await errorFromResponse(startRes);
    const { job_id: jobId } = (await startRes.json()) as { job_id: string };

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, TRANSCODE_POLL_INTERVAL_MS));

      const statusRes = await apiFetch(`/transcode/${jobId}`);
      if (!statusRes.ok) throw await errorFromResponse(statusRes);
      const job = (await statusRes.json()) as TranscodeStatus;

      if (job.status === "error") throw new ApiError(502, job.error ?? t("errors.conversion_failed"), job.error_code ?? undefined);
      onProgress?.(job.progress);
      if (job.status === "done") break;
    }

    const fileRes = await apiFetch(`/transcode/${jobId}/file`);
    if (!fileRes.ok) throw await errorFromResponse(fileRes);
    return fileRes.blob();
  },
};

export type YoutubeQuality = "480p" | "720p" | "1080p" | "2K" | "4K";

export type YoutubeAudioLang = "original" | "es" | "en" | "pt" | "fr" | "de" | "ja" | "ko" | "it" | "ru" | "hi" | "ar";

interface YoutubeStatus {
  status: "running" | "done" | "error";
  progress: number;
  error: string | null;
  error_code: string | null;
  title: string | null;
}

export interface YoutubeDownloadOptions {
  url: string;
  quality: YoutubeQuality;
  audioLang: YoutubeAudioLang;
  startTime?: string;
  endTime?: string;
  onProgress?: (ratio: number) => void;
}

export interface YoutubeDownloadResult {
  file: File;
  title: string;
}

const YOUTUBE_POLL_INTERVAL_MS = 1000;

export const youtubeApi = {
  // Same job-then-poll shape as transcodeApi: yt-dlp downloads (and, with
  // AV1/VP9 sources, ffmpeg's merge/remux step) can take a while for longer
  // clips, so this starts a backend job and polls its status instead of
  // holding one request open with no progress feedback.
  download: async ({ url, quality, audioLang, startTime, endTime, onProgress }: YoutubeDownloadOptions): Promise<YoutubeDownloadResult> => {
    const startRes = await apiFetch("/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        quality,
        audio_lang: audioLang,
        start_time: startTime || null,
        end_time: endTime || null,
      }),
    });
    if (!startRes.ok) throw await errorFromResponse(startRes);
    const { job_id: jobId } = (await startRes.json()) as { job_id: string };

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, YOUTUBE_POLL_INTERVAL_MS));

      const statusRes = await apiFetch(`/youtube/${jobId}`);
      if (!statusRes.ok) throw await errorFromResponse(statusRes);
      const job = (await statusRes.json()) as YoutubeStatus;

      if (job.status === "error") throw new ApiError(502, job.error ?? t("errors.download_failed"), job.error_code ?? undefined);
      onProgress?.(job.progress);
      if (job.status === "done") break;
    }

    const fileRes = await apiFetch(`/youtube/${jobId}/file`);
    if (!fileRes.ok) throw await errorFromResponse(fileRes);
    const blob = await fileRes.blob();
    const title = fileRes.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "video.mp4";
    return { file: new File([blob], title, { type: "video/mp4" }), title };
  },
};

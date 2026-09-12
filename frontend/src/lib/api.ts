const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "molko_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
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

export interface SubscriptionInfo {
  plan: "monthly" | "annual" | null;
  status: string;
  current_period_end: string | null;
  is_active: boolean;
}

export interface UserResponse {
  id: number;
  email: string;
  subscription: SubscriptionInfo | null;
}

export const authApi = {
  register: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<UserResponse>("/auth/me"),
};

export const billingApi = {
  createCheckoutSession: (plan: "monthly" | "annual") =>
    request<{ checkout_url: string }>("/billing/checkout-session", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  createPortalSession: () =>
    request<{ portal_url: string }>("/billing/portal-session", { method: "POST" }),
  status: () => request<SubscriptionInfo>("/billing/status"),
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

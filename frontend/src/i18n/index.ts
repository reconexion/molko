import { useSyncExternalStore } from "react";
import { en } from "./en";
import { es, type MessageKey } from "./es";

export type { MessageKey };
export type Language = "es" | "en";
export type MessageParams = Record<string, string | number>;

export const DEFAULT_LANGUAGE: Language = "es";

// Para sumar un idioma: agrégalo aquí, crea su diccionario (Record<MessageKey, string>)
// y regístralo en `dictionaries`. TypeScript avisa de cualquier clave que falte.
export const LANGUAGES: readonly { code: Language; label: string; locale: string }[] = [
  { code: "es", label: "Español", locale: "es-MX" },
  { code: "en", label: "English", locale: "en-US" },
];

const dictionaries: Record<Language, Record<string, string>> = { es, en };

const STORAGE_KEY = "molko_lang";

// Zonas horarias de países hispanohablantes: sirven como pista de ubicación cuando el
// navegador no declara ningún idioma que tengamos traducido.
const SPANISH_TIME_ZONES = new Set([
  "Europe/Madrid",
  "Africa/Ceuta",
  "Atlantic/Canary",
  "America/Mexico_City",
  "America/Cancun",
  "America/Merida",
  "America/Monterrey",
  "America/Matamoros",
  "America/Chihuahua",
  "America/Ciudad_Juarez",
  "America/Ojinaga",
  "America/Mazatlan",
  "America/Bahia_Banderas",
  "America/Hermosillo",
  "America/Tijuana",
  "America/Guatemala",
  "America/Belize",
  "America/El_Salvador",
  "America/Tegucigalpa",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Havana",
  "America/Santo_Domingo",
  "America/Puerto_Rico",
  "America/Bogota",
  "America/Caracas",
  "America/Guayaquil",
  "America/Lima",
  "America/La_Paz",
  "America/Asuncion",
  "America/Montevideo",
  "America/Santiago",
  "America/Punta_Arenas",
  "Pacific/Easter",
  "Pacific/Galapagos",
  "Africa/Malabo",
  // Chromium todavía reporta estos nombres antiguos en lugar de "America/Argentina/…".
  "America/Buenos_Aires",
  "America/Cordoba",
  "America/Mendoza",
  "America/Catamarca",
  "America/Jujuy",
  "America/Rosario",
]);

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function languageFromBrowser(): Language | null {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return null;
}

function languageFromLocation(): Language {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone) {
      return SPANISH_TIME_ZONES.has(timeZone) || timeZone.startsWith("America/Argentina/") ? "es" : "en";
    }
  } catch {
    // sin Intl: se usa el idioma base del producto
  }
  return DEFAULT_LANGUAGE;
}

// Prioridad: idioma elegido por la persona > idioma del navegador > ubicación (zona horaria).
// Lo detectado no se guarda: solo la elección explícita, para que el valor por defecto
// siga a la persona si cambia de configuración o de lugar.
export function detectLanguage(): Language {
  return readStoredLanguage() ?? languageFromBrowser() ?? languageFromLocation();
}

let current: Language = detectLanguage();
const listeners = new Set<() => void>();

function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language;
}
applyDocumentLanguage(current);

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // sin persistencia: el idioma dura lo que dure la pestaña
  }
  applyDocumentLanguage(language);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

// Para claves que llegan del servidor (p. ej. "errors.<code>"): null si no hay traducción.
export function translateOrNull(key: string, params?: MessageParams): string | null {
  const template = dictionaries[current][key] ?? dictionaries[DEFAULT_LANGUAGE][key];
  return template === undefined ? null : interpolate(template, params);
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translateOrNull(key, params) ?? key;
}

export function localeFor(language: Language = current): string {
  return LANGUAGES.find((entry) => entry.code === language)?.locale ?? "es-MX";
}

// Los componentes usan este hook para re-renderizarse al cambiar de idioma; el código
// que no es un componente (api.ts, ffmpeg.ts) importa `t` directamente.
export function useI18n() {
  const language = useSyncExternalStore(subscribe, getLanguage);
  return { language, setLanguage, t, locale: localeFor(language) };
}

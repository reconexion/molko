import type { MessageKey } from "../i18n";

export type DayPart = "morning" | "afternoon" | "evening" | "night";

// Franjas según la hora local del usuario.
export function dayPartFor(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 19) return "afternoon";
  if (hour >= 19 && hour < 22) return "evening";
  return "night";
}

export const GREETING_KEYS: Record<DayPart, MessageKey[]> = {
  morning: ["greeting.morning.1", "greeting.morning.2", "greeting.morning.3", "greeting.morning.4", "greeting.morning.5"],
  afternoon: [
    "greeting.afternoon.1",
    "greeting.afternoon.2",
    "greeting.afternoon.3",
    "greeting.afternoon.4",
    "greeting.afternoon.5",
  ],
  evening: ["greeting.evening.1", "greeting.evening.2", "greeting.evening.3", "greeting.evening.4", "greeting.evening.5"],
  night: ["greeting.night.1", "greeting.night.2", "greeting.night.3", "greeting.night.4", "greeting.night.5"],
};

export function pickGreetingKey(dayPart: DayPart, random: () => number = Math.random): MessageKey {
  const keys = GREETING_KEYS[dayPart];
  return keys[Math.min(keys.length - 1, Math.floor(random() * keys.length))];
}

// Todas las plantillas llevan ", {name}": sin nombre se quita esa parte y el saludo sigue
// leyéndose natural ("Buenos días, {name}" -> "Buenos días").
export function fillGreeting(template: string, name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return template.replaceAll("{name}", trimmed);
  return template.replace(/,\s*\{name\}/, "");
}

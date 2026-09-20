import type { MessageKey } from "../i18n";

// Datos de quien opera el servicio, para los términos. Se configuran en frontend/.env.
export const LEGAL = {
  name: (import.meta.env.VITE_LEGAL_NAME as string | undefined)?.trim() ?? "",
  contactEmail: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() ?? "",
  jurisdiction: (import.meta.env.VITE_LEGAL_JURISDICTION as string | undefined)?.trim() ?? "",
};

const PLACEHOLDERS: Record<string, { value: string; fallbackKey: MessageKey }> = {
  legalName: { value: LEGAL.name, fallbackKey: "terms.placeholder.legalName" },
  contactEmail: { value: LEGAL.contactEmail, fallbackKey: "terms.placeholder.contactEmail" },
  jurisdiction: { value: LEGAL.jurisdiction, fallbackKey: "terms.placeholder.jurisdiction" },
};

// Reemplaza {legalName}, {contactEmail} y {jurisdiction}; si falta el dato deja un
// marcador visible entre corchetes en vez de inventar uno.
export function fillLegal(text: string, translate: (key: MessageKey) => string): string {
  return text.replace(/\{(legalName|contactEmail|jurisdiction)\}/g, (_match, name: string) => {
    const entry = PLACEHOLDERS[name];
    return entry.value || translate(entry.fallbackKey);
  });
}

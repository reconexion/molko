import type { MessageKey } from "../i18n";
import type { BillingPlan } from "./api";

export interface Plan {
  id: BillingPlan;
  price: string;
  nameKey: MessageKey;
  cadenceKey: MessageKey;
  approxKey: MessageKey;
  subscribeKey: MessageKey;
  highlightKey?: MessageKey;
}

export const PLANS: Plan[] = [
  {
    id: "monthly",
    price: "$5 USD",
    nameKey: "plan.monthly.name",
    cadenceKey: "plan.monthly.cadence",
    approxKey: "plan.monthly.approx",
    subscribeKey: "plan.monthly.subscribe",
  },
  {
    id: "annual",
    price: "$50 USD",
    nameKey: "plan.annual.name",
    cadenceKey: "plan.annual.cadence",
    approxKey: "plan.annual.approx",
    subscribeKey: "plan.annual.subscribe",
    highlightKey: "plan.annual.highlight",
  },
];

// El descargador de YouTube queda fuera a propósito: el Documento Maestro (§3.3, §7.2)
// pide que no se promocione en el marketing de la app.
export const FEATURE_KEYS: MessageKey[] = ["features.brainrot", "features.parts", "features.browser"];

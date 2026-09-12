import { useState } from "react";
import { ApiError, billingApi } from "../lib/api";

export function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "annual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: "monthly" | "annual") {
    setError(null);
    setLoadingPlan(plan);
    try {
      const { checkout_url } = await billingApi.createCheckoutSession(plan);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar el pago");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="card">
      <h1>Elige tu plan</h1>
      {error && <p className="error">{error}</p>}
      <div className="pricing-grid">
        <div className="pricing-card">
          <h2>Mensual</h2>
          <p className="price">$5 USD / mes</p>
          <p className="muted">~$100 MXN al mes</p>
          <button className="button" onClick={() => subscribe("monthly")} disabled={loadingPlan !== null}>
            {loadingPlan === "monthly" ? "Redirigiendo…" : "Suscribirme mensual"}
          </button>
        </div>
        <div className="pricing-card pricing-card-highlight">
          <h2>Anual</h2>
          <p className="price">$50 USD / año</p>
          <p className="muted">~$1,000 MXN al año · ahorras ~17%</p>
          <button className="button" onClick={() => subscribe("annual")} disabled={loadingPlan !== null}>
            {loadingPlan === "annual" ? "Redirigiendo…" : "Suscribirme anual"}
          </button>
        </div>
      </div>
    </div>
  );
}

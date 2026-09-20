import { useEffect, useState } from "react";
import { Check } from "@untitledui/icons";
import { Navigate, useSearchParams } from "react-router-dom";
import { MolkoAvatar } from "../components/MolkoAvatar";
import { PlanCards } from "../components/PlanCards";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n } from "../i18n";
import { ApiError, billingApi, type BillingPlan } from "../lib/api";
import { FEATURE_KEYS } from "../lib/plans";

type CheckoutResult = "success" | "cancel" | null;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

export function PricingPage() {
  const { hasAccess, refreshUser } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle(t("title.default"));

  // Stripe vuelve con "?checkout=success|cancel". Se lee una vez y se limpia de la URL
  // para que recargar no repita el aviso.
  const [checkoutResult] = useState<CheckoutResult>(() => {
    const value = searchParams.get("checkout");
    return value === "success" || value === "cancel" ? value : null;
  });
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (searchParams.has("checkout")) {
      // "error": el registro creó la cuenta pero no pudo abrir el pago (llega con la página ya montada).
      if (searchParams.get("checkout") === "error") setError(t("pricing.error.checkout"));
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  // Tras pagar, Stripe avisa por webhook y eso puede tardar unos segundos: se
  // consulta la cuenta hasta que la suscripción aparezca activa (entonces se redirige).
  useEffect(() => {
    if (checkoutResult !== "success") return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      void refreshUser();
      if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        setGaveUp(true);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkoutResult, refreshUser]);

  async function subscribe(plan: BillingPlan) {
    setError(null);
    setLoadingPlan(plan);
    try {
      const { checkout_url } = await billingApi.createCheckoutSession(plan);
      window.location.assign(checkout_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pricing.error.checkout"));
      setLoadingPlan(null);
    }
  }

  if (hasAccess) return <Navigate to="/app" replace />;

  const confirming = checkoutResult === "success" && !gaveUp;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <MolkoAvatar size={128} />

      <div className="w-full rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary sm:p-8">
        <h1 className="text-2xl font-bold text-primary">{t("pricing.title")}</h1>
        <p className="mt-2 text-sm text-tertiary">{t("pricing.subtitle")}</p>

        {confirming && (
          <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-secondary ring-1 ring-secondary" role="status">
            {t("pricing.confirming")}
          </p>
        )}
        {checkoutResult === "success" && gaveUp && (
          <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-secondary ring-1 ring-secondary" role="status">
            {t("pricing.pending")}
          </p>
        )}
        {checkoutResult === "cancel" && (
          <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-secondary ring-1 ring-secondary" role="status">
            {t("pricing.canceled")}
          </p>
        )}

        <div className="mt-6">
          <PlanCards onSelect={subscribe} loadingPlan={loadingPlan} buttonLabel={(plan) => t(plan.subscribeKey)} />
        </div>

        {error && <p className="mt-4 text-sm text-error-primary">{error}</p>}

        <ul className="mt-6 flex flex-col gap-2 border-t border-secondary pt-6">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-secondary">
              <Check className="mt-0.5 size-4 shrink-0 text-success-primary" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

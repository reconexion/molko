import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./base/buttons/button";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { ApiError } from "../lib/api";

// Bloquea la app hasta que la persona acepte la versión vigente de los términos.
export function TermsUpdateDialog() {
  const { acceptTerms, logout } = useAuth();
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setSubmitting(true);
    try {
      await acceptTerms();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.network"));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-update-title"
        className="w-full max-w-md rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary"
      >
        <h2 id="terms-update-title" className="text-lg font-semibold text-primary">
          {t("termsUpdate.title")}
        </h2>
        <p className="mt-2 text-sm text-tertiary">{t("termsUpdate.body")}</p>
        <Link
          to="/terms"
          target="_blank"
          rel="noopener"
          className="mt-3 inline-block text-sm font-semibold text-brand-secondary hover:underline"
        >
          {t("termsUpdate.read")}
        </Link>
        {error && <p className="mt-3 text-sm text-error-primary">{error}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button color="success" isLoading={submitting} onClick={handleAccept} className="w-full sm:w-auto">
            {t("termsUpdate.accept")}
          </Button>
          <Button color="tertiary" onClick={logout} isDisabled={submitting} className="w-full sm:w-auto">
            {t("account.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}

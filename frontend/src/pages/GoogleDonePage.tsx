import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/base/buttons/button";
import { Splash } from "../components/Splash";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n } from "../i18n";
import { ApiError, authApi } from "../lib/api";

// Destino al que el servidor regresa tras Google: llega un código de un solo uso que aquí se
// canjea por la sesión. Se quita de la URL de inmediato para que no quede en el historial.
export function GoogleDonePage() {
  const { completeLogin } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentTitle(t("title.google"));

  // StrictMode monta dos veces en desarrollo y el código sirve una sola vez: se conserva
  // el valor leído y se canjea una única vez.
  const code = useRef(searchParams.get("code"));
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.current || started.current) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);

    authApi
      .googleSession(code.current)
      .then(async ({ access_token }) => {
        await completeLogin(access_token);
        navigate("/app", { replace: true });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errors.network")));
  }, [completeLogin, navigate, t]);

  if (!code.current) return <Navigate to="/login" replace />;

  if (error) {
    return (
      <Splash message={error}>
        <Button color="secondary" href="/login">
          {t("auth.google.backToLogin")}
        </Button>
      </Splash>
    );
  }
  return <Splash message={t("auth.google.finishing")} />;
}

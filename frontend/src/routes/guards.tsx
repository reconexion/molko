import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "../components/base/buttons/button";
import { Splash } from "../components/Splash";
import { TermsUpdateDialog } from "../components/TermsUpdateDialog";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

interface RedirectState {
  from?: { pathname: string; search: string };
  /** El registro creó la cuenta pero no pudo abrir el pago: /pricing avisa para reintentar. */
  checkoutError?: boolean;
}

function SessionStatus() {
  const { loading, connectionError, retryConnection } = useAuth();
  const { t } = useI18n();

  if (loading) return <Splash message={t("app.loading")} />;
  if (connectionError) {
    return (
      <Splash message={t("app.connectionError")}>
        <Button color="secondary" onClick={retryConnection}>
          {t("app.retry")}
        </Button>
      </Splash>
    );
  }
  return null;
}

// Rutas que exigen sesión. Si la persona aceptó una versión vieja de los términos,
// se le pide aceptar la vigente antes de seguir.
export function RequireAuth() {
  const { user, loading, connectionError } = useAuth();
  const location = useLocation();

  if (loading || connectionError) return <SessionStatus />;
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search } }} />;

  return (
    <>
      <Outlet />
      {!user.terms_accepted && <TermsUpdateDialog />}
    </>
  );
}

// Rutas del editor: además de sesión, exigen suscripción activa. Se conserva el query
// string porque Stripe regresa a /app?checkout=success antes de que llegue el webhook.
export function RequireSubscription() {
  const { hasAccess } = useAuth();
  const location = useLocation();

  if (!hasAccess) return <Navigate to={`/pricing${location.search}`} replace />;
  return <Outlet />;
}

// Login y registro: quien ya tiene sesión va directo a donde le toca.
export function GuestOnly() {
  const { user, loading, connectionError, hasAccess } = useAuth();
  const location = useLocation();

  if (loading || connectionError) return <SessionStatus />;
  if (user) {
    const { from, checkoutError } = (location.state as RedirectState | null) ?? {};
    const target = hasAccess ? (from ? `${from.pathname}${from.search}` : "/app") : checkoutError ? "/pricing?checkout=error" : "/pricing";
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

export function BillingSuccessPage() {
  const { user, refreshUser } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await refreshUser();
        if (cancelled) return;
        // refreshUser updates context state asynchronously; give React a tick
        // then check the freshest value via another refresh before deciding.
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (!cancelled) setChecking(false);
    }

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = user?.subscription?.is_active ?? false;

  useEffect(() => {
    if (isActive) setChecking(false);
  }, [isActive]);

  return (
    <div className="card">
      <h1>¡Gracias por tu pago!</h1>
      {isActive ? (
        <>
          <p>Tu suscripción está activa. Ya puedes crear tu primer video brainrot.</p>
          <Link className="button" to="/editor">
            Ir al editor
          </Link>
        </>
      ) : checking ? (
        <p className="muted">Confirmando tu pago con Stripe, esto toma unos segundos…</p>
      ) : (
        <>
          <p>
            Seguimos esperando la confirmación de Stripe. Si ya pagaste, espera unos minutos y recarga esta
            página.
          </p>
          <Link className="button button-secondary" to="/dashboard">
            Ir al panel
          </Link>
        </>
      )}
    </div>
  );
}

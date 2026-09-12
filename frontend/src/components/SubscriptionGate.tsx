import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Mirrors the backend's REQUIRE_SUBSCRIPTION testing switch: while false, the
// editor is reachable without an active Stripe subscription. Flip back to
// "true" (VITE_REQUIRE_SUBSCRIPTION=true in frontend/.env) before shipping.
const REQUIRE_SUBSCRIPTION = import.meta.env.VITE_REQUIRE_SUBSCRIPTION === "true";

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (REQUIRE_SUBSCRIPTION && !user?.subscription?.is_active) {
    return (
      <div className="card">
        <h2>Necesitas una suscripción activa</h2>
        <p>El editor de Molko es una función de pago. Suscríbete para crear tus videos.</p>
        <Link className="button" to="/pricing">
          Ver planes
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

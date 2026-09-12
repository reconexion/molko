import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Mirrors the backend's REQUIRE_SUBSCRIPTION testing switch, secure by
// default. Set VITE_REQUIRE_SUBSCRIPTION=false in frontend/.env only while
// testing locally with the backend's paywall also disabled.
const REQUIRE_SUBSCRIPTION = import.meta.env.VITE_REQUIRE_SUBSCRIPTION !== "false";

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

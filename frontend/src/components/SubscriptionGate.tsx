import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user?.subscription?.is_active) {
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

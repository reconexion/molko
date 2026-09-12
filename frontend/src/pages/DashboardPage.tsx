import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, billingApi } from "../lib/api";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = user?.subscription?.is_active ?? false;

  async function openPortal() {
    setError(null);
    setOpeningPortal(true);
    try {
      const { portal_url } = await billingApi.createPortalSession();
      window.location.href = portal_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir el portal de facturación");
      setOpeningPortal(false);
    }
  }

  return (
    <div className="card">
      <h1>Hola, {user?.email}</h1>

      {isActive ? (
        <>
          <p>
            Suscripción <strong>{user?.subscription?.plan === "annual" ? "anual" : "mensual"}</strong> activa.
          </p>
          <div className="actions">
            <Link className="button" to="/editor">
              Crear video
            </Link>
            <button className="button button-secondary" onClick={openPortal} disabled={openingPortal}>
              {openingPortal ? "Abriendo…" : "Gestionar suscripción"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Todavía no tienes una suscripción activa.</p>
          <Link className="button" to="/pricing">
            Ver planes
          </Link>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button
        className="link-button"
        onClick={() => {
          logout();
          navigate("/login");
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

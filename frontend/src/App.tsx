import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SubscriptionGate } from "./components/SubscriptionGate";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PricingPage } from "./pages/PricingPage";
import { BillingSuccessPage } from "./pages/BillingSuccessPage";
import { BillingCancelPage } from "./pages/BillingCancelPage";
import { EditorPage } from "./pages/EditorPage";

function Nav() {
  const { user } = useAuth();
  return (
    <header className="nav">
      <Link className="brand" to="/">
        Molko
      </Link>
      <nav>
        {user ? (
          <>
            <Link to="/dashboard">Panel</Link>
            <Link to="/editor">Editor</Link>
          </>
        ) : (
          <>
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/register">Registrarse</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <div className="app">
      <Nav />
      <main className="main">
        {loading ? (
          <p className="page-status">Cargando…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pricing"
              element={
                <ProtectedRoute>
                  <PricingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/success"
              element={
                <ProtectedRoute>
                  <BillingSuccessPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/cancel"
              element={
                <ProtectedRoute>
                  <BillingCancelPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/editor"
              element={
                <ProtectedRoute>
                  <SubscriptionGate>
                    <EditorPage />
                  </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

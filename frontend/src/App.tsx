import { Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { AppShell, DownloadRoute, EditorRoute } from "./pages/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { GoogleDonePage } from "./pages/GoogleDonePage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PricingPage } from "./pages/PricingPage";
import { TermsPage } from "./pages/TermsPage";
import { GuestOnly, RequireAuth, RequireSubscription } from "./routes/guards";

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="auth/google/done" element={<GoogleDonePage />} />

        <Route element={<GuestOnly />}>
          <Route path="login" element={<AuthPage mode="login" />} />
          <Route path="register" element={<AuthPage mode="register" />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="pricing" element={<PricingPage />} />
          <Route element={<RequireSubscription />}>
            <Route path="app" element={<AppShell />}>
              <Route index element={<Navigate to="editor" replace />} />
              <Route path="editor" element={<EditorRoute />} />
              <Route path="download" element={<DownloadRoute />} />
              <Route path="*" element={<Navigate to="/app/editor" replace />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

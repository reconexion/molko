import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-aria-components";
import { BrowserRouter, useHref, useNavigate } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import "./styles/globals.css";

// Los <Button href="/ruta"> de react-aria navegan dentro de la app (sin recargar la página).
function AriaRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      {children}
    </RouterProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AriaRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AriaRouter>
    </BrowserRouter>
  </StrictMode>,
);

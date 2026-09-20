import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, authApi, clearToken, getToken, setAuthFailureHandlers, setToken, type UserResponse } from "../lib/api";

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  /** El servidor no respondió al cargar la sesión (distinto de "no hay sesión"). */
  connectionError: boolean;
  hasAccess: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Abre la sesión con un token ya emitido por el servidor (regreso de Google). */
  completeLogin: (accessToken: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  acceptTerms: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  retryConnection: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const dropSession = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // Refresco silencioso (tras pagar, tras una descarga...): un fallo de red no debe
  // tumbar la pantalla actual ni perder lo que el usuario tiene a medias en el editor.
  const refreshUser = useCallback(async () => {
    if (!getToken()) return;
    try {
      setUser(await authApi.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) dropSession();
    }
  }, [dropSession]);

  useEffect(() => {
    setAuthFailureHandlers({ onUnauthorized: dropSession, onPaymentRequired: () => void refreshUser() });
    return () => setAuthFailureHandlers({});
  }, [dropSession, refreshUser]);

  useEffect(() => {
    let active = true;

    (async () => {
      if (getToken()) {
        try {
          const me = await authApi.me();
          if (active) setUser(me);
        } catch (err) {
          if (!active) return;
          if (err instanceof ApiError && err.status === 401) clearToken();
          else setConnectionError(true);
        }
      }
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const startSession = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    setUser(await authApi.me());
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await authApi.login(email, password);
      await startSession(access_token);
    },
    [startSession],
  );

  const updateName = useCallback(async (name: string) => {
    setUser(await authApi.updateProfile(name));
  }, []);

  const acceptTerms = useCallback(async () => {
    setUser(await authApi.acceptTerms());
  }, []);

  const logout = useCallback(() => {
    // apiFetch lee el token de forma síncrona, así que la petición sale con él antes de borrarlo.
    // Si falla (sin red) igual se cierra la sesión local; el token seguiría valiendo hasta expirar.
    void authApi.logout().catch(() => {});
    dropSession();
  }, [dropSession]);

  const retryConnection = useCallback(() => {
    setLoading(true);
    setConnectionError(false);
    setLoadAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      connectionError,
      hasAccess: user?.subscription?.is_active ?? false,
      login,
      completeLogin: startSession,
      updateName,
      acceptTerms,
      logout,
      refreshUser,
      retryConnection,
    }),
    [user, loading, connectionError, login, startSession, updateName, acceptTerms, logout, refreshUser, retryConnection],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

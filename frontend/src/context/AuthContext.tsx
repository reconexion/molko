import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, clearToken, setToken, type UserResponse } from "../lib/api";

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    // While the backend runs with REQUIRE_AUTH=false (see backend/.env), it
    // answers /auth/me with a fixed test user even without a token, so this
    // always attempts the call instead of skipping it when there's no token.
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await authApi.login(email, password);
      setToken(access_token);
      await refreshUser();
    },
    [refreshUser],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await authApi.register(email, password);
      setToken(access_token);
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

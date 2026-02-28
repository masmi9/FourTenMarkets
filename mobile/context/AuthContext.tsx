import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, AuthUser } from "@/lib/api";
import { saveToken, getToken, deleteToken } from "@/lib/storage";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    getToken().then((stored) => {
      if (stored) {
        setToken(stored);
        // Verify token is still valid
        auth.me().then((user) => {
          setUser(user);
        }).catch(() => {
          // Token invalid — clear it
          deleteToken();
          setToken(null);
        }).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await auth.login(email, password);
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const signup = async (email: string, password: string, name?: string) => {
    await auth.signup(email, password, name);
    // Server signup doesn't return a token, so log in immediately to get one
    const res = await auth.login(email, password);
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await deleteToken();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AuthUser,
  apiGetMe,
  apiLogin,
  apiRegister,
  clearToken,
  getStoredToken,
  storeToken,
} from '../lib/api-auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsVerification?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAuthenticated: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await getStoredToken();
        if (token) {
          const { user: me, error } = await apiGetMe(token);
          if (me && !error) {
            setUser(me);
          } else {
            await clearToken();
          }
        }
      } catch {
        // Network error on restore — stay logged out
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const result = await apiLogin(email, password);
      if (result.error) {
        return { error: result.error };
      }
      if (result.token && result.user) {
        await storeToken(result.token);
        setUser(result.user);
        return { error: null };
      }
      return { error: 'Unexpected response from server.' };
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }

  async function signUp(email: string, password: string): Promise<{ error: string | null; needsVerification?: boolean }> {
    try {
      const result = await apiRegister(email, password);
      if (result.error) {
        return { error: result.error };
      }
      return { error: null, needsVerification: true };
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }

  async function signOut(): Promise<void> {
    await clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

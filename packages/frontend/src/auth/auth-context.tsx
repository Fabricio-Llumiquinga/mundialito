import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  getCurrentAuthUser,
  type AuthUser,
  type AuthError,
} from './auth-service';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Interval in milliseconds to check session validity (every 5 minutes).
 */
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

const DEV_MODE = import.meta.env?.VITE_USE_MOCKS === 'true';

const DEV_USER: AuthUser = {
  userId: 'dev-user-123',
  email: 'dev@any2cloud.com',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: DEV_MODE ? DEV_USER : null,
    isAuthenticated: DEV_MODE,
    isLoading: DEV_MODE ? false : true,
    error: null,
  });

  // Check for existing session on mount (skip in dev mode)
  useEffect(() => {
    if (DEV_MODE) return;
    let mounted = true;

    async function checkSession() {
      // Check for existing tokens in localStorage
      const idToken = localStorage.getItem('mundialito_id_token');
      if (idToken) {
        try {
          const payload = JSON.parse(atob(idToken.split('.')[1]));
          const exp = payload.exp * 1000;
          if (exp > Date.now()) {
            const user: AuthUser = {
              userId: payload.sub ?? '',
              email: payload.email ?? payload['cognito:username'] ?? '',
            };
            if (mounted) {
              setState({
                user,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
            }
            return;
          } else {
            // Token expired, clear
            localStorage.removeItem('mundialito_id_token');
            localStorage.removeItem('mundialito_access_token');
            localStorage.removeItem('mundialito_refresh_token');
          }
        } catch {
          localStorage.removeItem('mundialito_id_token');
        }
      }

      if (mounted) {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    }

    checkSession();
    return () => { mounted = false; };
  }, []);

  // Periodic session validity check
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const interval = setInterval(async () => {
      const valid = await isSessionValid();
      if (!valid) {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: {
            type: 'SESSION_EXPIRED',
            message: 'Your session has expired. Please sign in again.',
          },
        });
      }
    }, SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [state.isAuthenticated]);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await authLogin(email, password);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error as AuthError,
      }));
      throw error;
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authRegister(email, password);
      // After successful registration, auto-login
      const user = await authLogin(email, password);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error as AuthError,
      }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } catch {
      // ignore
    } finally {
      // Clear stored tokens
      localStorage.removeItem('mundialito_id_token');
      localStorage.removeItem('mundialito_access_token');
      localStorage.removeItem('mundialito_refresh_token');
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access the authentication context.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

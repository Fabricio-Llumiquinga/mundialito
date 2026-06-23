import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that redirects unauthenticated users to the login page.
 * Preserves the intended destination for post-login redirect.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="loading-container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

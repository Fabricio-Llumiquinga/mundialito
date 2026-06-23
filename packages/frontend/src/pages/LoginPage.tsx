import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Spinner } from '@heroui/react';
import { useAuth } from '../auth/auth-context';

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [processingCode, setProcessingCode] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to matches
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/matches', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Check for OAuth code in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorDesc = params.get('error_description');

    if (errorDesc) {
      setError(decodeURIComponent(errorDesc));
      window.history.replaceState({}, '', '/login');
      return;
    }

    if (code) {
      setProcessingCode(true);
      exchangeCodeForTokens(code);
    }
  }, []);

  async function exchangeCodeForTokens(code: string) {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URL;

    try {
      const response = await fetch(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: code,
          redirect_uri: redirectUri,
        }),
      });

      if (response.ok) {
        const tokens = await response.json();
        localStorage.setItem('mundialito_id_token', tokens.id_token);
        localStorage.setItem('mundialito_access_token', tokens.access_token);
        if (tokens.refresh_token) {
          localStorage.setItem('mundialito_refresh_token', tokens.refresh_token);
        }

        // Clean URL and reload to trigger auth context
        window.history.replaceState({}, '', '/login');
        window.location.reload();
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error ?? 'Error al procesar la autenticación');
        setProcessingCode(false);
        window.history.replaceState({}, '', '/login');
      }
    } catch {
      setError('Error de conexión al servicio de autenticación');
      setProcessingCode(false);
      window.history.replaceState({}, '', '/login');
    }
  }

  function handleMicrosoftLogin() {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URL;

    const url = `https://${domain}/oauth2/authorize?identity_provider=Microsoft&response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+email+profile`;

    window.location.href = url;
  }

  // Show loading while processing OAuth code
  if (processingCode || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="text-gray-500 mt-4">Procesando autenticación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl bg-white rounded-xl shadow-lg border-none overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left - Logo */}
            <div className="flex flex-col items-center justify-center p-12">
              <img
                src="/logo-mundialista.png"
                alt="Any2Cloud Mundialito 2026"
                className="w-56 h-56 object-contain mb-6"
              />
              <h1 className="font-display text-2xl text-[#1a2332] uppercase tracking-wide text-center">
                Any2Cloud Mundialito 2026
              </h1>
              <p className="text-gray-500 text-sm mt-2 text-center">
                Predice, compite y gana con tus compañeros
              </p>
            </div>

            {/* Right - Login */}
            <div className="p-8 flex flex-col justify-center">
              <h2 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-6">
                Iniciar Sesión
              </h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6" role="alert">
                  {error}
                </div>
              )}

              <button
                onClick={handleMicrosoftLogin}
                className="w-full h-12 flex items-center justify-center gap-3 bg-[#1a2332] rounded-lg text-sm font-semibold text-white hover:bg-[#2d3748] transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Iniciar sesión con Microsoft
              </button>

              <p className="text-center text-xs text-gray-400 mt-6">
                Solo colaboradores @any2cloud.com
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

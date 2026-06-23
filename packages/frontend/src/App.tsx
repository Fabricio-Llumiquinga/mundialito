import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './auth';
import { Layout } from './layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { MatchesPage } from './pages/MatchesPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { DashboardPage } from './pages/DashboardPage';
import { RulesPage } from './pages/RulesPage';

export function App() {
  return (
    <main className="light text-foreground bg-background min-h-screen">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes with layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/predictions" element={<PredictionsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/rules" element={<RulesPage />} />
              <Route path="/" element={<Navigate to="/matches" replace />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </main>
  );
}

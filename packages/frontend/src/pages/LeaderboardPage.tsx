import React, { useState, useEffect } from 'react';
import { Card, CardContent, Chip, Spinner } from '@heroui/react';
import { Trophy, Users, Hash, Target } from 'lucide-react';
import type { LeaderboardEntry } from '@mudialito/shared';
import { fetchLeaderboard } from '../api';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../auth/auth-context';

export function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchLeaderboard();
      setEntries(response.entries);
      setCurrentUserRank(response.currentUserRank);
    } catch {
      setError('Error al cargar clasificación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function getRankDisplay(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  // Stats
  const currentUser = entries.find((e) => e.isCurrentUser);
  const totalExactScores = currentUser?.exactScoreCount ?? 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" />
        <p className="text-base text-gray-500 mt-3">Cargando clasificación...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-base px-4 py-3 rounded-lg" role="alert">
          <p>{error}</p>
          <button onClick={loadLeaderboard} className="mt-2 text-sm underline hover:no-underline">Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Navy Page Header */}
      <div className="page-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Clasificación</h1>
            <p className="text-white/70 text-sm mt-1">
              Compite con tus compañeros y sube en el ranking
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
            <span className="text-white/90 text-sm">{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stat Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 -mt-8">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-5 h-5 text-blue-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Tu Posición</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">#{currentUserRank}</span>
              <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">Posición</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Tu Puntaje</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{currentUser?.totalScore ?? 0}</span>
              <Chip size="sm" className="bg-yellow-100 text-yellow-700 text-xs font-medium">Puntos</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-green-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Total Jugadores</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{entries.length}</span>
              <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-medium">Jugadores</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-orange-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Marcadores Exactos</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{totalExactScores}</span>
              <Chip size="sm" className="bg-orange-100 text-orange-700 text-xs font-medium">Exactos</Chip>
            </div>
          </div>
        </div>

        {/* Top 3 Podium */}
        {entries.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Silver - 2nd */}
            <Card className="bg-white rounded-xl shadow-sm border border-gray-200 order-1 mt-4">
              <CardContent className="p-6 text-center">
                <div className="text-4xl mb-3">🥈</div>
                <span className="block font-display text-sm text-gray-900 uppercase truncate">{entries[1]?.displayName}</span>
                <span className="block font-display text-2xl text-gray-700 mt-2">{entries[1]?.totalScore} pts</span>
              </CardContent>
            </Card>
            {/* Gold - 1st */}
            <Card className="bg-white rounded-xl shadow-sm border border-yellow-200 order-2">
              <CardContent className="p-6 text-center">
                <div className="text-5xl mb-3">🥇</div>
                <span className="block font-display text-sm text-gray-900 uppercase truncate">{entries[0]?.displayName}</span>
                <span className="block font-display text-2xl text-yellow-600 mt-2">{entries[0]?.totalScore} pts</span>
              </CardContent>
            </Card>
            {/* Bronze - 3rd */}
            <Card className="bg-white rounded-xl shadow-sm border border-gray-200 order-3 mt-6">
              <CardContent className="p-6 text-center">
                <div className="text-4xl mb-3">🥉</div>
                <span className="block font-display text-sm text-gray-900 uppercase truncate">{entries[2]?.displayName}</span>
                <span className="block font-display text-2xl text-gray-700 mt-2">{entries[2]?.totalScore} pts</span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Full Table */}
        <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full" aria-label="Clasificación de jugadores">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-6 py-4">Posición</th>
                  <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-6 py-4">Jugador</th>
                  <th className="text-right text-xs uppercase tracking-wider text-gray-500 font-medium px-6 py-4">Puntaje</th>
                  <th className="text-right text-xs uppercase tracking-wider text-gray-500 font-medium px-6 py-4">Marcadores Exactos</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.userId}
                    className={`border-b border-gray-100 ${entry.isCurrentUser ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'even:bg-gray-50/50'}`}
                  >
                    <td className="py-4 px-6">
                      <span className="font-display text-lg font-bold text-gray-900">{getRankDisplay(entry.rank)}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900">{entry.displayName}</span>
                        {entry.isCurrentUser && (
                          <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">
                            Tú
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="font-display text-lg font-bold text-gray-900">{entry.totalScore}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-medium">
                        {entry.exactScoreCount}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {entries.length === 0 && (
          <EmptyState
            icon={<Trophy className="w-16 h-16 text-gray-300" />}
            title="Sin Puntajes Aún"
            description="La clasificación está vacía. ¡Comienza a predecir para ganar puntos y competir!"
            ctaLabel="Comenzar a Predecir"
            ctaHref="/predictions"
          />
        )}
      </div>
    </div>
  );
}

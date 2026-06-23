import React, { useState, useEffect } from 'react';
import { Card, CardContent, Chip, Spinner } from '@heroui/react';
import { Zap, Trophy, Target, CheckCircle, BarChart3 } from 'lucide-react';
import type { PredictionRecord, MatchView } from '@mudialito/shared';
import { fetchUserPredictions, fetchMatches } from '../api';
import type { TournamentPhase } from '@mudialito/shared';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../auth/auth-context';

const PHASE_LABELS: Record<TournamentPhase, string> = {
  group_stage: 'Fase de Grupos',
  round_of_32: 'Dieciseisavos',
  round_of_16: 'Octavos de Final',
  quarter_finals: 'Cuartos de Final',
  semi_finals: 'Semifinales',
  third_place: 'Tercer Lugar',
  final: 'Final',
};

export function DashboardPage() {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [leaderboardRank, setLeaderboardRank] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [predsRes, matchesRes] = await Promise.all([
        fetchUserPredictions(),
        fetchMatches(),
      ]);
      setPredictions(predsRes.predictions);
      setTotalScore(predsRes.totalScore);
      setLeaderboardRank(predsRes.leaderboardRank);
      setMatches(matchesRes.matches);
    } catch {
      setError('Error al cargar panel. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // Build a map of matchId -> MatchView for quick lookup
  const matchMap = new Map(matches.map((m) => [m.matchId, m]));

  // Separate predictions into match-based and tournament winner
  const matchPredictions = predictions.filter((p) => p.predictionType !== 'tournament_winner');
  const tournamentPrediction = predictions.find((p) => p.predictionType === 'tournament_winner');

  // Sort match predictions by match date (chronological)
  const sortedPredictions = [...matchPredictions].sort((a, b) => {
    const matchA = a.matchId ? matchMap.get(a.matchId) : null;
    const matchB = b.matchId ? matchMap.get(b.matchId) : null;
    const dateA = matchA?.date ?? a.createdAt;
    const dateB = matchB?.date ?? b.createdAt;
    return dateA.localeCompare(dateB);
  });

  // Separate into pending and resolved
  const pendingPredictions = sortedPredictions.filter((p) => {
    const match = p.matchId ? matchMap.get(p.matchId) : null;
    return match?.status !== 'completed';
  });

  const resolvedPredictions = sortedPredictions.filter((p) => {
    const match = p.matchId ? matchMap.get(p.matchId) : null;
    return match?.status === 'completed';
  });

  function formatOutcome(prediction: PredictionRecord, match?: MatchView): string {
    if (prediction.predictionType === 'match_winner') {
      if (prediction.outcome === 'team1') return match?.team1.teamName ?? 'Equipo 1';
      if (prediction.outcome === 'team2') return match?.team2.teamName ?? 'Equipo 2';
      return 'Empate';
    }
    if (prediction.predictionType === 'final_score') {
      return `${prediction.team1Score} – ${prediction.team2Score}`;
    }
    if (prediction.predictionType === 'tournament_winner') {
      return prediction.teamName ?? 'Desconocido';
    }
    return '—';
  }

  function formatActualResult(prediction: PredictionRecord): string {
    if (!prediction.actualResult) return '—';
    return `${prediction.actualResult.team1Score} – ${prediction.actualResult.team2Score}`;
  }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" />
        <p className="text-base text-gray-500 mt-3">Cargando panel...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-base px-4 py-3 rounded-lg" role="alert">
          <p>{error}</p>
          <button onClick={loadDashboard} className="mt-2 text-sm underline hover:no-underline">Reintentar</button>
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
            <h1 className="font-display text-2xl font-bold text-white">Mi Panel</h1>
            <p className="text-white/70 text-sm mt-1">
              Sigue tus predicciones y rendimiento
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
              <Zap className="w-5 h-5 text-blue-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Puntos Totales</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{totalScore}</span>
              <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">Puntos</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Posición</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">#{leaderboardRank}</span>
              <Chip size="sm" className="bg-yellow-100 text-yellow-700 text-xs font-medium">Posición</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-green-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Predicciones</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{predictions.length}</span>
              <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-medium">Total</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-orange-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Correctas</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">
                {resolvedPredictions.filter((p) => p.isCorrect).length}
              </span>
              <Chip size="sm" className="bg-orange-100 text-orange-700 text-xs font-medium">Correctas</Chip>
            </div>
          </div>
        </div>

        {/* Tournament Winner Prediction */}
        {tournamentPrediction && (
          <div className="mb-6">
            <h3 className="font-display text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Predicción de Campeón
            </h3>
            <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
              <CardContent className="p-6 flex flex-row items-center justify-between">
                <span className="font-display text-xl text-gray-900 uppercase">{tournamentPrediction.teamName}</span>
                {tournamentPrediction.pointsEarned !== undefined ? (
                  <Chip
                    size="sm"
                    className={tournamentPrediction.isCorrect ? 'bg-green-100 text-green-700 text-xs font-medium' : 'bg-red-100 text-red-700 text-xs font-medium'}
                  >
                    {tournamentPrediction.isCorrect ? '✓' : '✗'} {tournamentPrediction.pointsEarned} pts
                  </Chip>
                ) : (
                  <Chip size="sm" className="bg-gray-100 text-gray-600 text-xs font-medium">
                    Pendiente
                  </Chip>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Resolved Predictions */}
        {resolvedPredictions.length > 0 && (
          <div className="mb-6">
            <h3 className="font-display text-xs uppercase tracking-wider text-gray-500 mb-3">Predicciones Resueltas</h3>
            <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full" aria-label="Predicciones resueltas">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Partido</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Fecha</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Fase</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Tipo</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Predicción</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Resultado</th>
                      <th className="text-right text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedPredictions.map((pred, idx) => {
                      const match = pred.matchId ? matchMap.get(pred.matchId) : undefined;
                      return (
                        <tr key={`${pred.matchId}-${pred.predictionType}-${idx}`} className="border-b border-gray-100 even:bg-gray-50/50">
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-900">
                              {match ? `${match.team1.teamName} vs ${match.team2.teamName}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-gray-500">{match ? formatDate(match.date) : '—'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-gray-500">{match ? PHASE_LABELS[match.phase] : '—'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">
                              {pred.predictionType === 'match_winner' ? 'Ganador' : 'Marcador'}
                            </Chip>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-900">{formatOutcome(pred, match)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-600">{formatActualResult(pred)}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Chip
                              size="sm"
                              className={pred.isCorrect ? 'bg-green-100 text-green-700 text-xs font-medium' : 'bg-red-100 text-red-700 text-xs font-medium'}
                            >
                              {pred.isCorrect ? '✓' : '✗'} {pred.pointsEarned ?? 0}
                            </Chip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pending Predictions */}
        {pendingPredictions.length > 0 && (
          <div className="mb-6">
            <h3 className="font-display text-xs uppercase tracking-wider text-gray-500 mb-3">Predicciones Pendientes</h3>
            <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full" aria-label="Predicciones pendientes">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Partido</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Fecha</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Fase</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Tipo</th>
                      <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-medium px-4 py-3">Predicción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPredictions.map((pred, idx) => {
                      const match = pred.matchId ? matchMap.get(pred.matchId) : undefined;
                      return (
                        <tr key={`${pred.matchId}-${pred.predictionType}-${idx}`} className="border-b border-gray-100 even:bg-gray-50/50">
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-900">
                              {match ? `${match.team1.teamName} vs ${match.team2.teamName}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-gray-500">{match ? formatDate(match.date) : '—'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-gray-500">{match ? PHASE_LABELS[match.phase] : '—'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Chip size="sm" className="bg-gray-100 text-gray-600 text-xs font-medium">
                              {pred.predictionType === 'match_winner' ? 'Ganador' : 'Marcador'}
                            </Chip>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-900">{formatOutcome(pred, match)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {predictions.length === 0 && (
          <EmptyState
            icon={<BarChart3 className="w-16 h-16 text-gray-300" />}
            title="Sin Predicciones"
            description="Aún no has hecho predicciones. ¡Ve a la pestaña Predecir para comenzar y subir en la clasificación!"
            ctaLabel="Hacer Predicciones"
            ctaHref="/predictions"
          />
        )}
      </div>
    </div>
  );
}

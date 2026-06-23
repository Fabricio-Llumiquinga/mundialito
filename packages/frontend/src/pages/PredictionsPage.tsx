import React, { useState, useEffect } from 'react';
import { Card, CardContent, Chip, Button, Spinner } from '@heroui/react';
import { Target, CircleDot, Trophy, CheckCircle2, Zap } from 'lucide-react';
import type { MatchView, MatchOutcome, PredictionRecord } from '@mudialito/shared';
import type { TournamentPhase } from '@mudialito/shared';
import { fetchMatches, fetchUserPredictions, submitMatchWinner, submitFinalScore, submitTournamentWinner } from '../api';
import type { ApiError } from '../api';
import { getFlag } from '../utils/country-flags';
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

/**
 * Check if predictions are locked for a match.
 * Deadline: 8:00 AM Costa Rica (UTC-6) = 14:00 UTC of the match date.
 */
function isMatchLocked(match: MatchView): boolean {
  const [year, month, day] = match.date.split('-').map(Number);
  const deadline = new Date(Date.UTC(year, month - 1, day, 14, 0, 0)); // 14:00 UTC = 8AM CST
  return Date.now() >= deadline.getTime();
}

// 48 participating teams for tournament winner prediction
const PARTICIPATING_TEAMS = [
  'Argentina', 'Australia', 'Belgium', 'Bolivia', 'Brazil', 'Cameroon',
  'Canada', 'Chile', 'Colombia', 'Costa Rica', 'Croatia', 'Denmark',
  'Ecuador', 'Egypt', 'England', 'France', 'Germany', 'Ghana',
  'Indonesia', 'Iran', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan',
  'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway',
  'Panama', 'Paraguay', 'Peru', 'Poland', 'Portugal', 'Qatar',
  'Saudi Arabia', 'Senegal', 'Serbia', 'South Korea', 'Spain',
  'Switzerland', 'Tunisia', 'Turkey', 'USA', 'Ukraine', 'Uruguay', 'Venezuela',
];

export function PredictionsPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'match-winner' | 'final-score' | 'tournament-winner'>('match-winner');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [matchesRes, predsRes] = await Promise.all([
        fetchMatches(),
        fetchUserPredictions(),
      ]);
      setMatches(matchesRes.matches);
      setPredictions(predsRes.predictions);
    } catch {
      setError('Error al cargar datos. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Update local predictions state after a successful save.
   * Does NOT reload the entire page — only merges the new prediction.
   */
  function handlePredictionSaved(saved: PredictionRecord) {
    setPredictions((prev) => {
      const key = saved.predictionType === 'tournament_winner'
        ? 'tournament_winner'
        : `${saved.matchId}#${saved.predictionType}`;
      const idx = prev.findIndex((p) =>
        saved.predictionType === 'tournament_winner'
          ? p.predictionType === 'tournament_winner'
          : p.matchId === saved.matchId && p.predictionType === saved.predictionType
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...prev[idx], ...saved };
        return updated;
      }
      return [...prev, saved];
    });
  }

  // Stats
  const predictionsMade = predictions.length;
  const correctPredictions = predictions.filter((p) => p.isCorrect).length;
  const pointsEarned = predictions.reduce((sum, p) => sum + (p.pointsEarned ?? 0), 0);
  const tournamentPick = predictions.find((p) => p.predictionType === 'tournament_winner');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" />
        <p className="text-base text-gray-500 mt-3">Cargando predicciones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 text-base px-4 py-3 rounded-lg" role="alert">
          <p>{error}</p>
          <button onClick={loadData} className="mt-2 text-sm underline hover:no-underline">Reintentar</button>
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
            <h1 className="font-display text-2xl font-bold text-white">Hacer Predicciones</h1>
            <p className="text-white/70 text-sm mt-1">
              Envía tus predicciones antes de que inicien los partidos y gana puntos
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
              <Target className="w-5 h-5 text-blue-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Predicciones Hechas</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{predictionsMade}</span>
              <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">Total</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Correctas</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{correctPredictions}</span>
              <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-medium">Correctas</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Puntos Ganados</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{pointsEarned}</span>
              <Chip size="sm" className="bg-orange-100 text-orange-700 text-xs font-medium">Puntos</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Campeón Elegido</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-gray-900 truncate">
                {tournamentPick?.teamName ?? '—'}
              </span>
              <Chip size="sm" className="bg-yellow-100 text-yellow-700 text-xs font-medium">Elección</Chip>
            </div>
          </div>
        </div>

        {/* Deadline Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-blue-800 font-medium">⏰ Las predicciones se cierran a las 8:00 AM hora Costa Rica del día de cada partido. Tómalo como referencia para tu país.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('match-winner')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'match-winner'
                ? 'bg-[#1a2332] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Target className="w-4 h-4" /> Ganador del Partido
          </button>
          <button
            onClick={() => setActiveTab('final-score')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'final-score'
                ? 'bg-[#1a2332] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <CircleDot className="w-4 h-4" /> Marcador Final
          </button>
          <button
            onClick={() => setActiveTab('tournament-winner')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'tournament-winner'
                ? 'bg-[#1a2332] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Trophy className="w-4 h-4" /> Campeón del Torneo
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'match-winner' && (
          <MatchWinnerTab matches={matches} predictions={predictions} onPredictionSaved={handlePredictionSaved} />
        )}
        {activeTab === 'final-score' && (
          <FinalScoreTab matches={matches} predictions={predictions} onPredictionSaved={handlePredictionSaved} />
        )}
        {activeTab === 'tournament-winner' && (
          <TournamentWinnerTab predictions={predictions} onPredictionSaved={handlePredictionSaved} />
        )}
      </div>
    </div>
  );
}

// ─── Match Winner Tab ────────────────────────────────────────────────────────

interface MatchTabProps {
  matches: MatchView[];
  predictions: PredictionRecord[];
  onPredictionSaved: (pred: PredictionRecord) => void;
}

function MatchWinnerTab({ matches, predictions, onPredictionSaved }: MatchTabProps) {
  const availableMatches = matches.filter((m) => m.status === 'upcoming' && !isMatchLocked(m));
  const lockedTodayMatches = matches.filter((m) => m.status === 'upcoming' && isMatchLocked(m));

  if (availableMatches.length === 0 && lockedTodayMatches.length === 0) {
    return (
      <EmptyState
        icon={<Target className="w-16 h-16 text-gray-300" />}
        title="No hay partidos próximos"
        description="Todos los partidos han iniciado o finalizado. Vuelve cuando haya nuevos partidos."
      />
    );
  }

  return (
    <div className="space-y-4">
      {lockedTodayMatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-amber-800 font-medium">🔒 {lockedTodayMatches.length} partido(s) bloqueado(s) — Las predicciones se cierran a las 8:00 AM (hora Costa Rica) del día del partido</p>
        </div>
      )}
      {availableMatches.map((match) => (
        <MatchWinnerForm
          key={match.matchId}
          match={match}
          existingPrediction={predictions.find(
            (p) => p.matchId === match.matchId && p.predictionType === 'match_winner'
          )}
          onSaved={onPredictionSaved}
        />
      ))}
      {lockedTodayMatches.map((match) => (
        <MatchWinnerForm
          key={match.matchId}
          match={match}
          existingPrediction={predictions.find(
            (p) => p.matchId === match.matchId && p.predictionType === 'match_winner'
          )}
          onSaved={onPredictionSaved}
          locked
        />
      ))}
    </div>
  );
}

interface MatchWinnerFormProps {
  match: MatchView;
  existingPrediction?: PredictionRecord;
  onSaved: (pred: PredictionRecord) => void;
  locked?: boolean;
}

function MatchWinnerForm({ match, existingPrediction, onSaved, locked }: MatchWinnerFormProps) {
  const [selected, setSelected] = useState<string>(existingPrediction?.outcome ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isGroupStage = match.phase === 'group_stage';
  const isDisabled = match.status !== 'upcoming' || !!locked;

  async function handleSubmit() {
    if (!selected || isDisabled) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await submitMatchWinner({ matchId: match.matchId, outcome: selected as MatchOutcome });
      setMessage({ type: 'success', text: '¡Predicción guardada!' });
      onSaved({ matchId: match.matchId, predictionType: 'match_winner', outcome: selected } as PredictionRecord);
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr.message ?? 'Error al guardar predicción' });
    } finally {
      setSubmitting(false);
    }
  }

  const options = [
    { value: 'team1', label: `${getFlag(match.team1.teamName)} ${match.team1.teamName}` },
    ...(isGroupStage ? [{ value: 'draw', label: 'Empate' }] : []),
    { value: 'team2', label: `${getFlag(match.team2.teamName)} ${match.team2.teamName}` },
  ];

  return (
    <Card className={`bg-white rounded-xl shadow-sm border border-gray-200 ${isDisabled ? 'opacity-50' : ''}`}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
          <span className="font-display text-lg text-gray-900 uppercase">
            {getFlag(match.team1.teamName)} {match.team1.teamName} vs {match.team2.teamName} {getFlag(match.team2.teamName)}
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {PHASE_LABELS[match.phase]} {match.group ? `• Grupo ${match.group}` : ''}
          </span>
        </div>

        {/* Options as radio buttons */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              disabled={isDisabled || submitting}
              className={`flex-1 px-4 h-12 rounded-lg border text-sm font-medium transition-all text-center ${
                selected === opt.value
                  ? 'bg-[#1a2332] text-white border-[#1a2332]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            onPress={handleSubmit}
            isDisabled={!selected || isDisabled || submitting}
            className="w-full sm:w-auto h-10 text-sm font-semibold bg-[#1a2332] text-white"
          >
            {submitting ? <><Spinner size="sm" className="mr-2" /> Guardando...</> : existingPrediction ? 'Actualizar' : 'Enviar'}
          </Button>
          {message && (
            <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`} role={message.type === 'error' ? 'alert' : 'status'}>
              {message.type === 'success' && '✓ '}{message.text}
            </span>
          )}
        </div>

        {isDisabled && (
          <p className="text-xs text-gray-500 mt-3">
            {locked ? '🔒 Predicciones cerradas (8:00 AM hora Costa Rica del día del partido)' : 'Las predicciones están cerradas para este partido'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Final Score Tab ─────────────────────────────────────────────────────────

function FinalScoreTab({ matches, predictions, onPredictionSaved }: MatchTabProps) {
  const availableMatches = matches.filter((m) => m.status === 'upcoming' && !isMatchLocked(m));
  const lockedTodayMatches = matches.filter((m) => m.status === 'upcoming' && isMatchLocked(m));

  if (availableMatches.length === 0 && lockedTodayMatches.length === 0) {
    return (
      <EmptyState
        icon={<CircleDot className="w-16 h-16 text-gray-300" />}
        title="No hay partidos próximos"
        description="Todos los partidos han iniciado o finalizado. Vuelve cuando haya nuevos partidos."
      />
    );
  }

  return (
    <div className="space-y-4">
      {lockedTodayMatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-amber-800 font-medium">🔒 {lockedTodayMatches.length} partido(s) bloqueado(s) — Las predicciones se cierran a las 8:00 AM (hora Costa Rica) del día del partido</p>
        </div>
      )}
      {availableMatches.map((match) => (
        <FinalScoreForm
          key={match.matchId}
          match={match}
          existingPrediction={predictions.find(
            (p) => p.matchId === match.matchId && p.predictionType === 'final_score'
          )}
          onSaved={onPredictionSaved}
        />
      ))}
      {lockedTodayMatches.map((match) => (
        <FinalScoreForm
          key={match.matchId}
          match={match}
          existingPrediction={predictions.find(
            (p) => p.matchId === match.matchId && p.predictionType === 'final_score'
          )}
          onSaved={onPredictionSaved}
          locked
        />
      ))}
    </div>
  );
}

interface FinalScoreFormProps {
  match: MatchView;
  existingPrediction?: PredictionRecord;
  onSaved: (pred: PredictionRecord) => void;
  locked?: boolean;
}

function FinalScoreForm({ match, existingPrediction, onSaved, locked }: FinalScoreFormProps) {
  const [team1Score, setTeam1Score] = useState<string>(
    existingPrediction?.team1Score?.toString() ?? ''
  );
  const [team2Score, setTeam2Score] = useState<string>(
    existingPrediction?.team2Score?.toString() ?? ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isDisabled = match.status !== 'upcoming' || !!locked;

  function validateScore(value: string): boolean {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && num <= 99 && value === num.toString();
  }

  async function handleSubmit() {
    if (isDisabled) return;

    // Default empty fields to 0
    const score1 = team1Score.trim() === '' ? '0' : team1Score;
    const score2 = team2Score.trim() === '' ? '0' : team2Score;

    if (!validateScore(score1) || !validateScore(score2)) {
      setMessage({ type: 'error', text: 'Los goles deben ser números enteros entre 0 y 99' });
      return;
    }

    // Update displayed values with defaults
    setTeam1Score(score1);
    setTeam2Score(score2);

    setSubmitting(true);
    setMessage(null);
    try {
      await submitFinalScore({
        matchId: match.matchId,
        team1Score: parseInt(score1, 10),
        team2Score: parseInt(score2, 10),
      });
      setMessage({ type: 'success', text: '¡Predicción guardada!' });
      onSaved({ matchId: match.matchId, predictionType: 'final_score', team1Score: parseInt(score1, 10), team2Score: parseInt(score2, 10) } as PredictionRecord);
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr.message ?? 'Error al guardar predicción' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className={`bg-white rounded-xl shadow-sm border border-gray-200 ${isDisabled ? 'opacity-50' : ''}`}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
          <span className="font-display text-lg text-gray-900 uppercase">
            {getFlag(match.team1.teamName)} {match.team1.teamName} vs {match.team2.teamName} {getFlag(match.team2.teamName)}
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {PHASE_LABELS[match.phase]} {match.group ? `• Grupo ${match.group}` : ''}
          </span>
        </div>

        {/* Score Inputs */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center">
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">
              {getFlag(match.team1.teamName)} {match.team1.teamName}
            </label>
            <input
              type="number"
              min={0}
              max={99}
              value={team1Score}
              onChange={(e) => setTeam1Score(e.target.value)}
              disabled={isDisabled || submitting}
              placeholder="0"
              aria-label={`Goles de ${match.team1.teamName}`}
              className="w-20 h-16 text-center font-display text-3xl text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            />
          </div>
          <span className="font-display text-2xl text-gray-400 mt-6">–</span>
          <div className="text-center">
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">
              {getFlag(match.team2.teamName)} {match.team2.teamName}
            </label>
            <input
              type="number"
              min={0}
              max={99}
              value={team2Score}
              onChange={(e) => setTeam2Score(e.target.value)}
              disabled={isDisabled || submitting}
              placeholder="0"
              aria-label={`Goles de ${match.team2.teamName}`}
              className="w-20 h-16 text-center font-display text-3xl text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            onPress={handleSubmit}
            isDisabled={isDisabled || submitting}
            className="w-full sm:w-auto h-10 text-sm font-semibold bg-[#1a2332] text-white"
          >
            {submitting ? <><Spinner size="sm" className="mr-2" /> Guardando...</> : existingPrediction ? 'Actualizar' : 'Enviar'}
          </Button>
          {message && (
            <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`} role={message.type === 'error' ? 'alert' : 'status'}>
              {message.type === 'success' && '✓ '}{message.text}
            </span>
          )}
        </div>

        {isDisabled && (
          <p className="text-xs text-gray-500 mt-3">
            {locked ? '🔒 Predicciones cerradas (8:00 AM hora Costa Rica del día del partido)' : 'Las predicciones están cerradas para este partido'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tournament Winner Tab ───────────────────────────────────────────────────

interface TournamentWinnerTabProps {
  predictions: PredictionRecord[];
  onPredictionSaved: (pred: PredictionRecord) => void;
}

function TournamentWinnerTab({ predictions, onPredictionSaved }: TournamentWinnerTabProps) {
  const existingPrediction = predictions.find((p) => p.predictionType === 'tournament_winner');
  const isLocked = !!existingPrediction; // Once saved, cannot change
  const [selectedTeam, setSelectedTeam] = useState<string>(existingPrediction?.teamName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit() {
    if (!selectedTeam || isLocked) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await submitTournamentWinner({ teamId: selectedTeam.toLowerCase().replace(/\s+/g, '-') });
      setMessage({ type: 'success', text: '¡Predicción de campeón guardada!' });
      onPredictionSaved({ predictionType: 'tournament_winner', teamId: selectedTeam.toLowerCase().replace(/\s+/g, '-'), teamName: selectedTeam } as PredictionRecord);
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr.message ?? 'Error al guardar predicción' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
        <CardContent className="p-6">
          <h3 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-1 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" /> ¿Quién ganará la Copa del Mundo?
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {isLocked
              ? 'Tu predicción de campeón ya fue registrada y no puede modificarse.'
              : 'Selecciona un equipo de las 48 naciones participantes. Una vez enviada, no podrás cambiarla.'}
          </p>

          {/* Native select */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            disabled={submitting || isLocked}
            aria-label="Campeón del torneo"
            className={`w-full mb-4 bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg px-4 h-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="">Selecciona un equipo...</option>
            {PARTICIPATING_TEAMS.map((team) => (
              <option key={team} value={team}>
                {getFlag(team)} {team}
              </option>
            ))}
          </select>

          {existingPrediction && (
            <div className="bg-blue-50 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <span className="text-xs text-gray-500">🔒 Predicción registrada:</span>
              <span className="text-sm text-blue-700 font-medium">{existingPrediction.teamName}</span>
            </div>
          )}

          {!isLocked && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onPress={handleSubmit}
                isDisabled={!selectedTeam || submitting}
                className="w-full sm:w-auto h-10 text-sm font-semibold bg-[#1a2332] text-white"
              >
                {submitting ? <><Spinner size="sm" className="mr-2" /> Guardando...</> : 'Enviar Predicción'}
              </Button>
              {message && (
                <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`} role={message.type === 'error' ? 'alert' : 'status'}>
                  {message.text}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

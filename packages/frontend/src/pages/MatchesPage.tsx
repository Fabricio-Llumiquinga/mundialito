import React, { useState, useEffect } from 'react';
import { Card, CardContent, Chip, Spinner } from '@heroui/react';
import { MapPin, Building2, Calendar, Clock, Radio, CheckCircle2 } from 'lucide-react';
import type { MatchView } from '@mudialito/shared';
import type { TournamentPhase } from '@mudialito/shared';
import { fetchMatches } from '../api';
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

const PHASES: TournamentPhase[] = [
  'group_stage',
  'round_of_32',
  'round_of_16',
  'quarter_finals',
  'semi_finals',
  'third_place',
  'final',
];

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Tournament start date (June 11, 2026 - 1:00 PM ET = 17:00 UTC)
const TOURNAMENT_START = new Date('2026-06-11T17:00:00Z');

function useCountdown(matches: MatchView[]) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Find the next upcoming match (sort by date + time)
  const upcomingMatches = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => {
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    });

  const nextMatch = upcomingMatches[0];
  const targetDate = TOURNAMENT_START;

  const diff = targetDate.getTime() - now.getTime();
  const isCountingDown = diff > 0;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isCountingDown, nextMatch };
}

export function MatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<TournamentPhase | ''>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  const { days, hours, minutes, seconds, isCountingDown, nextMatch } = useCountdown(matches);

  useEffect(() => {
    loadMatches();
  }, [selectedPhase, selectedGroup]);

  async function loadMatches() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchMatches(
        selectedPhase || undefined,
        selectedGroup || undefined
      );
      setMatches(response.matches);
      setTotalCount(response.totalCount);
    } catch {
      setError('Error al cargar partidos. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handlePhaseChange(value: string) {
    setSelectedPhase((value || '') as TournamentPhase | '');
    if (value !== 'group_stage') {
      setSelectedGroup('');
    }
  }

  function handleGroupChange(value: string) {
    setSelectedGroup(value || '');
  }

  function formatDate(dateStr: string): string {
    // dateStr is "YYYY-MM-DD" — parse in UTC to avoid day shift
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  function formatTime(timeStr: string): string {
    // timeStr is "HH:MM" — venue local time, display as-is in 12h format
    const [h, min] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  }

  // Group matches by venue-local date
  const matchesByDate = matches.reduce<Record<string, MatchView[]>>((acc, match) => {
    const key = match.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const sortedDates = Object.keys(matchesByDate).sort();

  // Compute stats
  const upcomingCount = matches.filter((m) => m.status === 'upcoming').length;
  const liveCount = matches.filter((m) => m.status === 'in_progress').length;
  const completedCount = matches.filter((m) => m.status === 'completed').length;

  return (
    <div className="animate-fade-in">
      {/* Navy Page Header */}
      <div className="page-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Any2Cloud Mundialito 2026 — Calendario de Partidos</h1>
            <p className="text-white/70 text-sm mt-1">
              Explora los {totalCount} partidos de todas las fases del torneo · <span className="italic">Horarios en hora local del estadio</span>
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
              <Calendar className="w-5 h-5 text-blue-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Total Partidos</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{totalCount}</span>
              <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-medium">Partidos</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Próximos</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{upcomingCount}</span>
              <Chip size="sm" className="bg-gray-100 text-gray-600 text-xs font-medium">Próximos</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-5 h-5 text-green-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">En Vivo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{liveCount}</span>
              <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-medium">En Vivo</Chip>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Finalizados</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-gray-900">{completedCount}</span>
              <Chip size="sm" className="bg-orange-100 text-orange-700 text-xs font-medium">Finalizados</Chip>
            </div>
          </div>
        </div>

        {/* Countdown Card */}
        {isCountingDown && (
          <Card className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <CardContent className="p-6">
              <h3 className="font-display text-xs uppercase tracking-wider text-gray-500 text-center mb-2">
                {nextMatch ? 'Próximo Partido' : 'El Torneo Comienza En'}
              </h3>
              {nextMatch && (
                <div className="flex items-center justify-center gap-3 mb-4">
                  <span className="font-display text-gray-900 text-lg uppercase">
                    {getFlag(nextMatch.team1.teamName)} {nextMatch.team1.teamName}
                  </span>
                  <span className="text-blue-600 font-display text-base">vs</span>
                  <span className="font-display text-gray-900 text-lg uppercase">
                    {nextMatch.team2.teamName} {getFlag(nextMatch.team2.teamName)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <div className="text-center">
                  <span className="block font-display text-4xl text-gray-900">{days}</span>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Días</span>
                </div>
                <span className="text-blue-500 font-display text-3xl -mt-4">:</span>
                <div className="text-center">
                  <span className="block font-display text-4xl text-gray-900">
                    {hours.toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Horas</span>
                </div>
                <span className="text-blue-500 font-display text-3xl -mt-4">:</span>
                <div className="text-center">
                  <span className="block font-display text-4xl text-gray-900">
                    {minutes.toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Min</span>
                </div>
                <span className="text-blue-500 font-display text-3xl -mt-4">:</span>
                <div className="text-center">
                  <span className="block font-display text-4xl text-gray-900">
                    {seconds.toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Seg</span>
                </div>
              </div>
              {nextMatch && (
                <p className="text-center text-sm text-gray-500 mt-4 flex items-center justify-center gap-1">
                  <MapPin className="w-4 h-4" /> {nextMatch.venue}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filter Section */}
        <Card className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedPhase}
                onChange={(e) => handlePhaseChange(e.target.value)}
                aria-label="Filtro de fase"
                className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg px-4 h-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas las Fases</option>
                {PHASES.map((phase) => (
                  <option key={phase} value={phase}>
                    {PHASE_LABELS[phase]}
                  </option>
                ))}
              </select>

              {selectedPhase === 'group_stage' && (
                <select
                  value={selectedGroup}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  aria-label="Filtro de grupo"
                  className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg px-4 h-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 animate-fade-in"
                >
                  <option value="">Todos los Grupos</option>
                  {GROUPS.map((group) => (
                    <option key={group} value={group}>
                      Grupo {group}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={loadMatches}
                className="bg-[#1a2332] text-white text-sm font-medium px-5 h-10 rounded-lg hover:bg-[#2d3748] transition-colors"
              >
                Filtrar
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner size="lg" />
            <p className="text-base text-gray-500 mt-3">Cargando partidos...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-base px-4 py-3 rounded-lg" role="alert">
            <p>{error}</p>
            <button
              onClick={loadMatches}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <EmptyState
            icon={<Building2 className="w-16 h-16 text-gray-300" />}
            title="No se encontraron partidos"
            description="No se encontraron partidos con los filtros seleccionados. Intenta ajustar los criterios."
          />
        )}

        {!loading && !error && sortedDates.length > 0 && (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date}>
                <h3 className="font-display text-xs uppercase tracking-wider text-gray-500 mb-3 border-b border-gray-200 pb-2">
                  {formatDate(date)}
                </h3>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {matchesByDate[date].map((match) => (
                    <MatchCard key={match.matchId} match={match} formatTime={formatTime} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface MatchCardProps {
  match: MatchView;
  formatTime: (time: string) => string;
}

function MatchCard({ match, formatTime }: MatchCardProps) {
  return (
    <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
      <CardContent className="p-4">
        {/* Top row: status + phase */}
        <div className="flex items-center justify-between mb-3">
          {match.status === 'in_progress' && (
            <Chip size="sm" className="bg-green-100 text-green-700 text-xs font-semibold uppercase">
              En Vivo
            </Chip>
          )}
          {match.status === 'completed' && (
            <Chip size="sm" className="bg-orange-100 text-orange-700 text-xs font-semibold uppercase">
              Finalizado
            </Chip>
          )}
          {match.status === 'upcoming' && (
            <Chip size="sm" className="bg-blue-100 text-blue-700 text-xs font-semibold uppercase">
              {formatTime(match.time)}
            </Chip>
          )}
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {match.group ? `Grupo ${match.group}` : PHASE_LABELS[match.phase]}
          </span>
        </div>

        {/* Teams & Score */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{getFlag(match.team1.teamName)}</span>
              <span className="font-display text-base text-gray-900 uppercase truncate">{match.team1.teamName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{getFlag(match.team2.teamName)}</span>
              <span className="font-display text-base text-gray-900 uppercase truncate">{match.team2.teamName}</span>
            </div>
          </div>

          {/* Score */}
          {match.result && (
            <div className="text-right ml-4">
              <div className="font-display text-2xl font-bold text-gray-900 leading-tight">{match.result.team1Score}</div>
              <div className="font-display text-2xl font-bold text-gray-900 leading-tight">{match.result.team2Score}</div>
            </div>
          )}
        </div>

        {/* Venue */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {match.venue}
          </span>
          {match.status === 'upcoming' && (
            <span className="text-[10px] text-gray-400 italic">Hora local del estadio</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

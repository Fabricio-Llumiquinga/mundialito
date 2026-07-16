/**
 * API client that uses worldcup26.ir for match data
 * and localStorage for predictions (client-side only for now).
 */

import type {
  MatchesResponse,
  LeaderboardResponse,
  UserPredictionsResponse,
  MatchWinnerPredictionRequest,
  FinalScorePredictionRequest,
  TournamentWinnerPredictionRequest,
  MatchView,
  TournamentPhase,
} from '@mudialito/shared';

const WORLDCUP_API = '/data';

interface ApiError {
  status: number;
  message: string;
}

// ─── Type mapping from worldcup26.ir to our types ─────────────────────────────

interface WorldCupGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string;
  stadium_id: string;
  finished: string;
  time_elapsed: string;
  type: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
  home_penalty_score?: string;
  away_penalty_score?: string;
}

function mapPhase(type: string): TournamentPhase {
  switch (type) {
    case 'group': return 'group_stage';
    case 'r32': return 'round_of_32';
    case 'r16': return 'round_of_16';
    case 'qf': return 'quarter_finals';
    case 'sf': return 'semi_finals';
    case 'third': return 'third_place';
    case 'final': return 'final';
    default: return 'group_stage';
  }
}

function mapStatus(game: WorldCupGame): 'upcoming' | 'in_progress' | 'completed' {
  if (game.finished === 'TRUE') return 'completed';
  if (game.time_elapsed === 'notstarted') return 'upcoming';
  return 'in_progress';
}

/**
 * Resolve a "Winner Match X" or "Loser Match X" label into the actual team name
 * by looking up the referenced match result in the games array.
 *
 * - If the API already provides home_team_name_en, that takes priority (handled in mapGame).
 * - This function is only called when home_team_name_en is missing but a label exists.
 * - Returns the resolved team name, or the original label if not resolvable yet.
 */
function resolveTeamLabel(label: string, gamesById: Record<string, WorldCupGame>): { name: string; teamId: string } | null {
  // Match patterns: "Winner Match 101", "Loser Match 102"
  const winnerMatch = label.match(/^Winner Match (\d+)$/i);
  const loserMatch = label.match(/^Loser Match (\d+)$/i);

  if (winnerMatch) {
    const refId = winnerMatch[1];
    const refGame = gamesById[refId];
    if (refGame && (refGame.finished === 'TRUE' || refGame.time_elapsed === 'finished')) {
      const homeScore = parseInt(refGame.home_score, 10) || 0;
      const awayScore = parseInt(refGame.away_score, 10) || 0;

      if (homeScore > awayScore) {
        return { name: refGame.home_team_name_en ?? refGame.home_team_label ?? `Equipo ${refGame.home_team_id}`, teamId: refGame.home_team_id };
      } else if (awayScore > homeScore) {
        return { name: refGame.away_team_name_en ?? refGame.away_team_label ?? `Equipo ${refGame.away_team_id}`, teamId: refGame.away_team_id };
      } else {
        // Draw in knockout → check penalty scores
        const homePen = parseInt(refGame.home_penalty_score ?? '', 10);
        const awayPen = parseInt(refGame.away_penalty_score ?? '', 10);
        if (!isNaN(homePen) && !isNaN(awayPen)) {
          if (homePen > awayPen) {
            return { name: refGame.home_team_name_en ?? refGame.home_team_label ?? `Equipo ${refGame.home_team_id}`, teamId: refGame.home_team_id };
          } else {
            return { name: refGame.away_team_name_en ?? refGame.away_team_label ?? `Equipo ${refGame.away_team_id}`, teamId: refGame.away_team_id };
          }
        }
      }
    }
    return null; // Not resolvable yet
  }

  if (loserMatch) {
    const refId = loserMatch[1];
    const refGame = gamesById[refId];
    if (refGame && (refGame.finished === 'TRUE' || refGame.time_elapsed === 'finished')) {
      const homeScore = parseInt(refGame.home_score, 10) || 0;
      const awayScore = parseInt(refGame.away_score, 10) || 0;

      if (homeScore > awayScore) {
        return { name: refGame.away_team_name_en ?? refGame.away_team_label ?? `Equipo ${refGame.away_team_id}`, teamId: refGame.away_team_id };
      } else if (awayScore > homeScore) {
        return { name: refGame.home_team_name_en ?? refGame.home_team_label ?? `Equipo ${refGame.home_team_id}`, teamId: refGame.home_team_id };
      } else {
        // Draw in knockout → loser is the one who lost on penalties
        const homePen = parseInt(refGame.home_penalty_score ?? '', 10);
        const awayPen = parseInt(refGame.away_penalty_score ?? '', 10);
        if (!isNaN(homePen) && !isNaN(awayPen)) {
          if (homePen > awayPen) {
            return { name: refGame.away_team_name_en ?? refGame.away_team_label ?? `Equipo ${refGame.away_team_id}`, teamId: refGame.away_team_id };
          } else {
            return { name: refGame.home_team_name_en ?? refGame.home_team_label ?? `Equipo ${refGame.home_team_id}`, teamId: refGame.home_team_id };
          }
        }
      }
    }
    return null; // Not resolvable yet
  }

  return null; // Not a resolvable pattern
}

function mapGame(game: WorldCupGame, stadiums?: Record<string, StadiumInfo>, gamesById?: Record<string, WorldCupGame>): MatchView {
  const status = mapStatus(game);
  const phase = mapPhase(game.type);

  // Resolve team names: API name takes priority, then try resolving labels, then fallback to raw label
  let homeTeam = game.home_team_name_en;
  let homeTeamId = game.home_team_id;
  if (!homeTeam && game.home_team_label && gamesById) {
    const resolved = resolveTeamLabel(game.home_team_label, gamesById);
    if (resolved) {
      homeTeam = resolved.name;
      homeTeamId = resolved.teamId;
    }
  }
  homeTeam = homeTeam ?? game.home_team_label ?? `Equipo ${game.home_team_id}`;

  let awayTeam = game.away_team_name_en;
  let awayTeamId = game.away_team_id;
  if (!awayTeam && game.away_team_label && gamesById) {
    const resolved = resolveTeamLabel(game.away_team_label, gamesById);
    if (resolved) {
      awayTeam = resolved.name;
      awayTeamId = resolved.teamId;
    }
  }
  awayTeam = awayTeam ?? game.away_team_label ?? `Equipo ${game.away_team_id}`;

  // Parse date: "06/11/2026 13:00" → venue local time (displayed as-is)
  const [datePart, timePart] = (game.local_date ?? '').split(' ');
  const [month, day, year] = (datePart ?? '').split('/');
  const isoDate = year && month && day ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
  const venueTime = timePart ?? '00:00';

  // Get stadium info for venue name
  const stadiumInfo = stadiums?.[game.stadium_id];
  const venueName = stadiumInfo?.name ?? `Estadio ${game.stadium_id}`;

  const matchView: MatchView = {
    matchId: `wc-${game.id}`,
    team1: { teamId: homeTeamId, teamName: homeTeam },
    team2: { teamId: awayTeamId, teamName: awayTeam },
    date: isoDate,
    time: venueTime, // venue local time as HH:MM
    venue: venueName,
    phase,
    status,
  };

  if (phase === 'group_stage' && game.group) {
    matchView.group = game.group;
  }

  if (status === 'completed' || (game.home_score !== '0' || game.away_score !== '0') && game.finished === 'TRUE') {
    matchView.result = {
      team1Score: parseInt(game.home_score, 10) || 0,
      team2Score: parseInt(game.away_score, 10) || 0,
    };
  }

  return matchView;
}

// ─── Matches (from static JSON served by our CloudFront) ─────────────────────

interface StadiumInfo {
  name: string;
  region: string;
}

let stadiumsCache: Record<string, StadiumInfo> | null = null;

async function getStadiums(): Promise<Record<string, StadiumInfo>> {
  if (stadiumsCache) return stadiumsCache;
  try {
    const res = await fetch('/data/stadiums.json');
    const data = await res.json();
    const stadiums = data.stadiums ?? data;
    stadiumsCache = {};
    for (const s of stadiums) {
      stadiumsCache[s.id] = { name: `${s.name_en}, ${s.city_en}`, region: s.region ?? 'Eastern' };
    }
  } catch {
    stadiumsCache = {};
  }
  return stadiumsCache;
}

// UTC offset in hours for summer (June-July) by region
function getUtcOffsetForRegion(region: string): number {
  switch (region) {
    case 'Eastern': return -4; // EDT
    case 'Central': return -5; // CDT (US Central) / Mexico City CDT
    case 'Western': return -7; // PDT
    default: return -4;
  }
}

export async function fetchMatches(phase?: string, group?: string): Promise<MatchesResponse> {
  const [response, stadiums] = await Promise.all([
    fetch(`${WORLDCUP_API}/games.json`),
    getStadiums(),
  ]);

  if (!response.ok) {
    throw { status: response.status, message: 'Error al cargar partidos' } as ApiError;
  }

  const data = await response.json();
  const games: WorldCupGame[] = data.games ?? [];

  // Build lookup by game ID so knockout matches can resolve "Winner/Loser Match X" labels
  const gamesById: Record<string, WorldCupGame> = {};
  for (const g of games) {
    gamesById[g.id] = g;
  }

  let matches: MatchView[] = games.map((g: WorldCupGame) => mapGame(g, stadiums, gamesById));

  // Sort by UTC time stored in time field
  matches.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  // Filter by phase
  if (phase) {
    matches = matches.filter((m) => m.phase === phase);
  }

  // Filter by group
  if (group) {
    matches = matches.filter((m) => m.group === group.toUpperCase());
  }

  return { matches, totalCount: matches.length };
}

// ─── Predictions (DynamoDB via Lambda Function URL) ──────────────────────────

const PREDICTIONS_API = import.meta.env?.VITE_PREDICTIONS_API_URL ?? '';

function getAuthToken(): string {
  return localStorage.getItem('mundialito_id_token') ?? '';
}

async function predictionsRequest(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const response = await fetch(`${PREDICTIONS_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Error' }));
    throw { status: response.status, message: body.error ?? 'Error' } as ApiError;
  }
  return response.json();
}

export async function submitMatchWinner(data: MatchWinnerPredictionRequest): Promise<{ message: string }> {
  return predictionsRequest('/predict', {
    method: 'POST',
    body: JSON.stringify({ ...data, predictionType: 'match_winner' }),
  });
}

export async function submitFinalScore(data: FinalScorePredictionRequest): Promise<{ message: string }> {
  return predictionsRequest('/predict', {
    method: 'POST',
    body: JSON.stringify({ ...data, predictionType: 'final_score' }),
  });
}

export async function submitTournamentWinner(data: TournamentWinnerPredictionRequest): Promise<{ message: string }> {
  return predictionsRequest('/predict', {
    method: 'POST',
    body: JSON.stringify({ ...data, predictionType: 'tournament_winner', teamName: data.teamId }),
  });
}

export async function fetchUserPredictions(): Promise<UserPredictionsResponse> {
  return predictionsRequest('/predictions');
}

// ─── Leaderboard ───────────────────────────────────────────────────────────

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return predictionsRequest('/leaderboard');
}

export type { ApiError };

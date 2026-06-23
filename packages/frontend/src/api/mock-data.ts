/**
 * Mock data for local development without a backend.
 * Used when VITE_USE_MOCKS=true
 */

import type {
  MatchesResponse,
  LeaderboardResponse,
  UserPredictionsResponse,
  MatchView,
  LeaderboardEntry,
  PredictionRecord,
} from '@mudialito/shared';

const MOCK_MATCHES: MatchView[] = [
  {
    matchId: 'm-2026-06-11-mexico-south-africa',
    team1: { teamId: 'mexico', teamName: 'Mexico' },
    team2: { teamId: 'south-africa', teamName: 'South Africa' },
    date: '2026-06-11',
    time: '19:00',
    venue: 'Mexico City',
    phase: 'group_stage',
    group: 'A',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-11-south-korea-czech-republic',
    team1: { teamId: 'south-korea', teamName: 'South Korea' },
    team2: { teamId: 'czech-republic', teamName: 'Czech Republic' },
    date: '2026-06-11',
    time: '20:00',
    venue: 'Guadalajara (Zapopan)',
    phase: 'group_stage',
    group: 'A',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-12-canada-bosnia-herzegovina',
    team1: { teamId: 'canada', teamName: 'Canada' },
    team2: { teamId: 'bosnia-herzegovina', teamName: 'Bosnia & Herzegovina' },
    date: '2026-06-12',
    time: '15:00',
    venue: 'Toronto',
    phase: 'group_stage',
    group: 'B',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-12-usa-paraguay',
    team1: { teamId: 'usa', teamName: 'USA' },
    team2: { teamId: 'paraguay', teamName: 'Paraguay' },
    date: '2026-06-12',
    time: '18:00',
    venue: 'Los Angeles (Inglewood)',
    phase: 'group_stage',
    group: 'D',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-13-brazil-morocco',
    team1: { teamId: 'brazil', teamName: 'Brazil' },
    team2: { teamId: 'morocco', teamName: 'Morocco' },
    date: '2026-06-13',
    time: '18:00',
    venue: 'New York/New Jersey (East Rutherford)',
    phase: 'group_stage',
    group: 'C',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-14-germany-cura-ao',
    team1: { teamId: 'germany', teamName: 'Germany' },
    team2: { teamId: 'curacao', teamName: 'Curaçao' },
    date: '2026-06-14',
    time: '12:00',
    venue: 'Houston',
    phase: 'group_stage',
    group: 'E',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-15-spain-cape-verde',
    team1: { teamId: 'spain', teamName: 'Spain' },
    team2: { teamId: 'cape-verde', teamName: 'Cape Verde' },
    date: '2026-06-15',
    time: '12:00',
    venue: 'Atlanta',
    phase: 'group_stage',
    group: 'H',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-16-france-senegal',
    team1: { teamId: 'france', teamName: 'France' },
    team2: { teamId: 'senegal', teamName: 'Senegal' },
    date: '2026-06-16',
    time: '15:00',
    venue: 'New York/New Jersey (East Rutherford)',
    phase: 'group_stage',
    group: 'I',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-16-argentina-algeria',
    team1: { teamId: 'argentina', teamName: 'Argentina' },
    team2: { teamId: 'algeria', teamName: 'Algeria' },
    date: '2026-06-16',
    time: '20:00',
    venue: 'Kansas City',
    phase: 'group_stage',
    group: 'J',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-17-england-croatia',
    team1: { teamId: 'england', teamName: 'England' },
    team2: { teamId: 'croatia', teamName: 'Croatia' },
    date: '2026-06-17',
    time: '15:00',
    venue: 'Dallas (Arlington)',
    phase: 'group_stage',
    group: 'L',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-06-17-portugal-dr-congo',
    team1: { teamId: 'portugal', teamName: 'Portugal' },
    team2: { teamId: 'dr-congo', teamName: 'DR Congo' },
    date: '2026-06-17',
    time: '12:00',
    venue: 'Houston',
    phase: 'group_stage',
    group: 'K',
    status: 'upcoming',
  },
  {
    matchId: 'm-2026-07-19-final',
    team1: { teamId: 'tbd-1', teamName: 'W101' },
    team2: { teamId: 'tbd-2', teamName: 'W102' },
    date: '2026-07-19',
    time: '15:00',
    venue: 'New York/New Jersey (East Rutherford)',
    phase: 'final',
    status: 'upcoming',
  },
];

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, userId: 'user-1', displayName: 'Carlos M.', totalScore: 45, exactScoreCount: 4, isCurrentUser: false },
  { rank: 2, userId: 'user-2', displayName: 'María G.', totalScore: 38, exactScoreCount: 3, isCurrentUser: false },
  { rank: 3, userId: 'user-3', displayName: 'Fabricio L.', totalScore: 35, exactScoreCount: 3, isCurrentUser: true },
  { rank: 4, userId: 'user-4', displayName: 'Andrea P.', totalScore: 30, exactScoreCount: 2, isCurrentUser: false },
  { rank: 5, userId: 'user-5', displayName: 'Diego R.', totalScore: 28, exactScoreCount: 2, isCurrentUser: false },
  { rank: 6, userId: 'user-6', displayName: 'Sofía V.', totalScore: 25, exactScoreCount: 1, isCurrentUser: false },
  { rank: 7, userId: 'user-7', displayName: 'Juan C.', totalScore: 22, exactScoreCount: 1, isCurrentUser: false },
  { rank: 8, userId: 'user-8', displayName: 'Valentina S.', totalScore: 18, exactScoreCount: 0, isCurrentUser: false },
];

const MOCK_PREDICTIONS: PredictionRecord[] = [
  {
    matchId: 'm-2026-06-11-mexico-south-africa',
    predictionType: 'match_winner',
    outcome: 'team1',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
  },
  {
    matchId: 'm-2026-06-11-mexico-south-africa',
    predictionType: 'final_score',
    team1Score: 2,
    team2Score: 0,
    createdAt: '2026-06-01T10:05:00Z',
    updatedAt: '2026-06-01T10:05:00Z',
  },
  {
    predictionType: 'tournament_winner',
    teamId: 'argentina',
    teamName: 'Argentina',
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-01T09:00:00Z',
  },
];

// ─── Mock API Functions ──────────────────────────────────────────────────────

export async function mockFetchMatches(phase?: string, group?: string): Promise<MatchesResponse> {
  await delay(300);
  let filtered = MOCK_MATCHES;
  if (phase) {
    filtered = filtered.filter((m) => m.phase === phase);
  }
  if (group) {
    filtered = filtered.filter((m) => m.group === group.toUpperCase());
  }
  return { matches: filtered, totalCount: filtered.length };
}

export async function mockFetchLeaderboard(): Promise<LeaderboardResponse> {
  await delay(200);
  return { entries: MOCK_LEADERBOARD, currentUserRank: 3 };
}

export async function mockFetchUserPredictions(): Promise<UserPredictionsResponse> {
  await delay(250);
  return { predictions: MOCK_PREDICTIONS, totalScore: 35, leaderboardRank: 3 };
}

export async function mockSubmitMatchWinner(): Promise<{ message: string }> {
  await delay(400);
  return { message: 'Match winner prediction saved successfully' };
}

export async function mockSubmitFinalScore(): Promise<{ message: string }> {
  await delay(400);
  return { message: 'Final score prediction saved successfully' };
}

export async function mockSubmitTournamentWinner(): Promise<{ message: string }> {
  await delay(400);
  return { message: 'Tournament winner prediction saved successfully' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

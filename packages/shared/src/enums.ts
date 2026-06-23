/**
 * Tournament phases for the FIFA World Cup 2026.
 */
export type TournamentPhase =
  | 'group_stage'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_finals'
  | 'semi_finals'
  | 'third_place'
  | 'final';

/**
 * Match status computed dynamically based on current time and result availability.
 */
export type MatchStatus = 'upcoming' | 'in_progress' | 'completed';

/**
 * Prediction outcome for match winner predictions.
 * 'draw' is only valid for group stage matches.
 */
export type MatchOutcome = 'team1' | 'team2' | 'draw';

/**
 * Types of predictions a user can submit.
 */
export type PredictionType = 'match_winner' | 'final_score' | 'tournament_winner';

/**
 * Penalty winner indicator for knockout matches decided by shootout.
 */
export type PenaltyWinner = 'team1' | 'team2';

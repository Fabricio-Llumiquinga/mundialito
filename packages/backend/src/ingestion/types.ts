import { TournamentPhase } from '@mudialito/shared';

/**
 * Raw match data parsed from an external data source.
 * This is the intermediate representation before being stored as a MatchEntity.
 */
export interface RawMatchData {
  matchId: string;
  team1: string;
  team2: string;
  date: string;
  time: string;
  venue: string;
  phase: TournamentPhase;
  group?: string;
  score?: {
    ft: [number, number];
  };
  penaltyWinner?: 'team1' | 'team2';
}

/**
 * Data source adapter interface (Strategy Pattern).
 * Decouples the ingestion service from the specific data source implementation.
 */
export interface MatchDataSource {
  /**
   * Fetch all matches from the data source.
   * @returns Array of raw match data parsed from the source format.
   */
  fetchMatches(): Promise<RawMatchData[]>;

  /**
   * Get the name of this data source (for logging and identification).
   */
  getName(): string;
}

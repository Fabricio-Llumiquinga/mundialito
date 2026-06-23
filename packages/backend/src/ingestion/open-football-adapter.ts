import { TournamentPhase } from '@mudialito/shared';
import { MatchDataSource, RawMatchData } from './types';

/**
 * Shape of a single match in the openfootball flat JSON format.
 */
interface OpenFootballMatch {
  round: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  num?: number;
  score?: {
    ft?: [number, number];
    et?: [number, number];
    pen?: [number, number];
  };
}

/**
 * Shape of the openfootball worldcup.json response (flat matches array).
 */
interface OpenFootballResponse {
  name: string;
  matches: OpenFootballMatch[];
}

const DEFAULT_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

/**
 * Adapter that fetches match data from the openfootball/worldcup.json GitHub repository.
 * Implements the MatchDataSource interface for the data abstraction layer.
 */
export class OpenFootballAdapter implements MatchDataSource {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_URL) {
    this.baseUrl = baseUrl;
  }

  getName(): string {
    return 'openfootball';
  }

  async fetchMatches(): Promise<RawMatchData[]> {
    const response = await fetch(this.baseUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch match data from openfootball: ${response.status} ${response.statusText}`
      );
    }

    const data: OpenFootballResponse = await response.json();
    return this.parseMatches(data);
  }

  /**
   * Parse the openfootball flat matches array into RawMatchData[].
   */
  private parseMatches(data: OpenFootballResponse): RawMatchData[] {
    const results: RawMatchData[] = [];

    if (!data.matches || !Array.isArray(data.matches)) {
      return results;
    }

    for (const match of data.matches) {
      const parsed = this.parseMatch(match);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Parse a single openfootball match entry into RawMatchData.
   * Returns null if the match is missing required fields.
   */
  private parseMatch(match: OpenFootballMatch): RawMatchData | null {
    if (!match.team1 || !match.team2 || !match.date || !match.ground) {
      return null;
    }

    const time = match.time || '00:00';
    const phase = this.mapRoundToPhase(match.round);
    const matchId = this.generateMatchId(match.date, match.team1, match.team2);

    const rawMatch: RawMatchData = {
      matchId,
      team1: match.team1,
      team2: match.team2,
      date: match.date,
      time,
      venue: match.ground,
      phase,
      group: match.group,
    };

    // Include score if available
    if (match.score?.ft) {
      rawMatch.score = { ft: match.score.ft };
    }

    // Determine penalty winner for knockout matches decided by shootout
    if (match.score?.pen) {
      const [pen1, pen2] = match.score.pen;
      if (pen1 > pen2) {
        rawMatch.penaltyWinner = 'team1';
      } else if (pen2 > pen1) {
        rawMatch.penaltyWinner = 'team2';
      }
    }

    return rawMatch;
  }

  /**
   * Generate a stable, deterministic match ID from date + team combination.
   * Format: m-{date}-{team1slug}-{team2slug}
   *
   * @example generateMatchId('2026-06-11', 'Mexico', 'United States') => 'm-2026-06-11-mexico-united-states'
   */
  generateMatchId(date: string, team1: string, team2: string): string {
    const team1Slug = this.slugify(team1);
    const team2Slug = this.slugify(team2);
    return `m-${date}-${team1Slug}-${team2Slug}`;
  }

  /**
   * Convert a team name to a URL-safe slug.
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Map openfootball round names to TournamentPhase enum values.
   *
   * Openfootball uses round names like:
   * - "Matchday 1", "Matchday 2", "Matchday 3" → group_stage
   * - "Round of 32" → round_of_32
   * - "Round of 16" → round_of_16
   * - "Quarter-finals" / "Quarterfinals" → quarter_finals
   * - "Semi-finals" / "Semifinals" → semi_finals
   * - "Third Place" / "Third-place" / "Match for third place" → third_place
   * - "Final" → final
   */
  mapRoundToPhase(round: string): TournamentPhase {
    const normalized = round.toLowerCase().trim();

    if (normalized.startsWith('matchday') || normalized.startsWith('group')) {
      return 'group_stage';
    }

    if (normalized.includes('round of 32')) {
      return 'round_of_32';
    }

    if (normalized.includes('round of 16')) {
      return 'round_of_16';
    }

    if (normalized.includes('quarter')) {
      return 'quarter_finals';
    }

    if (normalized.includes('semi')) {
      return 'semi_finals';
    }

    if (normalized.includes('third') || normalized.includes('3rd')) {
      return 'third_place';
    }

    if (normalized === 'final' || normalized === 'finals') {
      return 'final';
    }

    // Default to group_stage for unrecognized round names
    return 'group_stage';
  }
}

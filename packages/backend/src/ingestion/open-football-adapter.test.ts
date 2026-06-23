import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenFootballAdapter } from './open-football-adapter';

describe('OpenFootballAdapter', () => {
  let adapter: OpenFootballAdapter;

  beforeEach(() => {
    adapter = new OpenFootballAdapter('https://example.com/worldcup.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getName()', () => {
    it('returns "openfootball"', () => {
      expect(adapter.getName()).toBe('openfootball');
    });
  });

  describe('generateMatchId()', () => {
    it('generates a stable ID from date and team names', () => {
      const id = adapter.generateMatchId('2026-06-11', 'Mexico', 'United States');
      expect(id).toBe('m-2026-06-11-mexico-united-states');
    });

    it('handles team names with special characters', () => {
      const id = adapter.generateMatchId('2026-06-12', "Côte d'Ivoire", 'Korea Republic');
      expect(id).toBe('m-2026-06-12-c-te-d-ivoire-korea-republic');
    });

    it('produces the same ID for the same inputs (deterministic)', () => {
      const id1 = adapter.generateMatchId('2026-06-11', 'Brazil', 'Argentina');
      const id2 = adapter.generateMatchId('2026-06-11', 'Brazil', 'Argentina');
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different dates', () => {
      const id1 = adapter.generateMatchId('2026-06-11', 'Brazil', 'Argentina');
      const id2 = adapter.generateMatchId('2026-06-12', 'Brazil', 'Argentina');
      expect(id1).not.toBe(id2);
    });

    it('produces different IDs for different teams', () => {
      const id1 = adapter.generateMatchId('2026-06-11', 'Brazil', 'Argentina');
      const id2 = adapter.generateMatchId('2026-06-11', 'Germany', 'France');
      expect(id1).not.toBe(id2);
    });
  });

  describe('mapRoundToPhase()', () => {
    it('maps "Matchday 1" to group_stage', () => {
      expect(adapter.mapRoundToPhase('Matchday 1')).toBe('group_stage');
    });

    it('maps "Matchday 2" to group_stage', () => {
      expect(adapter.mapRoundToPhase('Matchday 2')).toBe('group_stage');
    });

    it('maps "Matchday 3" to group_stage', () => {
      expect(adapter.mapRoundToPhase('Matchday 3')).toBe('group_stage');
    });

    it('maps "Group A" style names to group_stage', () => {
      expect(adapter.mapRoundToPhase('Group A')).toBe('group_stage');
    });

    it('maps "Round of 32" to round_of_32', () => {
      expect(adapter.mapRoundToPhase('Round of 32')).toBe('round_of_32');
    });

    it('maps "Round of 16" to round_of_16', () => {
      expect(adapter.mapRoundToPhase('Round of 16')).toBe('round_of_16');
    });

    it('maps "Quarter-finals" to quarter_finals', () => {
      expect(adapter.mapRoundToPhase('Quarter-finals')).toBe('quarter_finals');
    });

    it('maps "Quarterfinals" to quarter_finals', () => {
      expect(adapter.mapRoundToPhase('Quarterfinals')).toBe('quarter_finals');
    });

    it('maps "Semi-finals" to semi_finals', () => {
      expect(adapter.mapRoundToPhase('Semi-finals')).toBe('semi_finals');
    });

    it('maps "Semifinals" to semi_finals', () => {
      expect(adapter.mapRoundToPhase('Semifinals')).toBe('semi_finals');
    });

    it('maps "Third Place" to third_place', () => {
      expect(adapter.mapRoundToPhase('Third Place')).toBe('third_place');
    });

    it('maps "Match for third place" to third_place', () => {
      expect(adapter.mapRoundToPhase('Match for third place')).toBe('third_place');
    });

    it('maps "3rd Place" to third_place', () => {
      expect(adapter.mapRoundToPhase('3rd Place')).toBe('third_place');
    });

    it('maps "Final" to final', () => {
      expect(adapter.mapRoundToPhase('Final')).toBe('final');
    });

    it('is case-insensitive', () => {
      expect(adapter.mapRoundToPhase('ROUND OF 16')).toBe('round_of_16');
      expect(adapter.mapRoundToPhase('quarter-FINALS')).toBe('quarter_finals');
    });
  });

  describe('fetchMatches()', () => {
    it('parses a flat matches array correctly', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Matchday 1',
            date: '2026-06-11',
            time: '21:00',
            team1: 'Mexico',
            team2: 'United States',
            group: 'A',
            ground: 'Estadio Azteca',
          },
          {
            round: 'Matchday 1',
            date: '2026-06-12',
            time: '18:00',
            team1: 'Brazil',
            team2: 'Germany',
            group: 'B',
            ground: 'MetLife Stadium',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({
        matchId: 'm-2026-06-11-mexico-united-states',
        team1: 'Mexico',
        team2: 'United States',
        date: '2026-06-11',
        time: '21:00',
        venue: 'Estadio Azteca',
        phase: 'group_stage',
        group: 'A',
      });
      expect(matches[1]).toEqual({
        matchId: 'm-2026-06-12-brazil-germany',
        team1: 'Brazil',
        team2: 'Germany',
        date: '2026-06-12',
        time: '18:00',
        venue: 'MetLife Stadium',
        phase: 'group_stage',
        group: 'B',
      });
    });

    it('includes score when available', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Matchday 1',
            date: '2026-06-11',
            time: '21:00',
            team1: 'Mexico',
            team2: 'United States',
            group: 'A',
            ground: 'Estadio Azteca',
            score: { ft: [2, 1] },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches[0].score).toEqual({ ft: [2, 1] });
    });

    it('determines penalty winner from penalty score', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Round of 16',
            date: '2026-07-01',
            time: '18:00',
            team1: 'Brazil',
            team2: 'Argentina',
            ground: 'MetLife Stadium',
            score: { ft: [1, 1], et: [1, 1], pen: [4, 3] },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches[0].penaltyWinner).toBe('team1');
      expect(matches[0].phase).toBe('round_of_16');
    });

    it('sets penaltyWinner to team2 when team2 wins penalties', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Quarter-finals',
            date: '2026-07-05',
            time: '20:00',
            team1: 'France',
            team2: 'Spain',
            ground: 'Rose Bowl',
            score: { ft: [2, 2], et: [2, 2], pen: [3, 5] },
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches[0].penaltyWinner).toBe('team2');
    });

    it('skips matches missing required fields', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Matchday 1',
            date: '2026-06-11',
            time: '21:00',
            team1: 'Mexico',
            team2: 'United States',
            group: 'A',
            ground: 'Estadio Azteca',
          },
          {
            // Missing team2
            round: 'Matchday 1',
            date: '2026-06-11',
            time: '18:00',
            team1: 'Brazil',
            team2: '',
            group: 'B',
            ground: 'MetLife Stadium',
          },
          {
            // Missing ground (venue)
            round: 'Matchday 1',
            date: '2026-06-12',
            time: '15:00',
            team1: 'Germany',
            team2: 'France',
            group: 'C',
            ground: '',
          },
          {
            // Missing date
            round: 'Matchday 1',
            date: '',
            time: '15:00',
            team1: 'Italy',
            team2: 'Spain',
            group: 'D',
            ground: 'Some Stadium',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches).toHaveLength(1);
      expect(matches[0].team1).toBe('Mexico');
    });

    it('defaults time to "00:00" when not provided', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Matchday 1',
            date: '2026-06-11',
            team1: 'Mexico',
            team2: 'United States',
            group: 'A',
            ground: 'Estadio Azteca',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches[0].time).toBe('00:00');
    });

    it('throws an error when the fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(adapter.fetchMatches()).rejects.toThrow(
        'Failed to fetch match data from openfootball: 404 Not Found'
      );
    });

    it('handles empty matches array', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches).toHaveLength(0);
    });

    it('handles missing matches field gracefully', async () => {
      const mockData = {
        name: 'World Cup 2026',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches).toHaveLength(0);
    });

    it('maps knockout round names correctly', async () => {
      const mockData = {
        name: 'World Cup 2026',
        matches: [
          {
            round: 'Round of 32',
            date: '2026-06-28',
            time: '18:00',
            team1: 'Team A',
            team2: 'Team B',
            ground: 'Stadium 1',
            num: 49,
          },
          {
            round: 'Final',
            date: '2026-07-19',
            time: '20:00',
            team1: 'Team C',
            team2: 'Team D',
            ground: 'MetLife Stadium',
            num: 104,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const matches = await adapter.fetchMatches();

      expect(matches[0].phase).toBe('round_of_32');
      expect(matches[0].group).toBeUndefined();
      expect(matches[1].phase).toBe('final');
    });
  });
});

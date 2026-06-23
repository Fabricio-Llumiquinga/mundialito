/**
 * Unit tests for PredictionValidator.
 *
 * Tests cover:
 * - Match winner validation by phase (group stage vs knockout)
 * - Final score validation (range, integer, non-negative)
 * - Tournament winner validation (valid team ID)
 * - Match open status (upcoming only)
 * - Tournament winner open status (final match upcoming)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictionValidator } from './prediction-validator';
import { TournamentPhase, MatchOutcome } from '@mudialito/shared';

// Mock the DynamoDB client
const mockSend = vi.fn();
const mockClient = { send: mockSend } as any;
const TEST_TABLE = 'TestTable';

describe('PredictionValidator', () => {
  let validator: PredictionValidator;

  beforeEach(() => {
    validator = new PredictionValidator(mockClient, TEST_TABLE);
    mockSend.mockReset();
  });

  describe('validateMatchWinner', () => {
    it('should accept team1 for group stage', () => {
      const result = validator.validateMatchWinner('team1', 'group_stage');
      expect(result).toEqual({ valid: true });
    });

    it('should accept team2 for group stage', () => {
      const result = validator.validateMatchWinner('team2', 'group_stage');
      expect(result).toEqual({ valid: true });
    });

    it('should accept draw for group stage', () => {
      const result = validator.validateMatchWinner('draw', 'group_stage');
      expect(result).toEqual({ valid: true });
    });

    it('should accept team1 for knockout phases', () => {
      const knockoutPhases: TournamentPhase[] = [
        'round_of_32',
        'round_of_16',
        'quarter_finals',
        'semi_finals',
        'third_place',
        'final',
      ];

      for (const phase of knockoutPhases) {
        const result = validator.validateMatchWinner('team1', phase);
        expect(result).toEqual({ valid: true });
      }
    });

    it('should accept team2 for knockout phases', () => {
      const knockoutPhases: TournamentPhase[] = [
        'round_of_32',
        'round_of_16',
        'quarter_finals',
        'semi_finals',
        'third_place',
        'final',
      ];

      for (const phase of knockoutPhases) {
        const result = validator.validateMatchWinner('team2', phase);
        expect(result).toEqual({ valid: true });
      }
    });

    it('should reject draw for knockout phases', () => {
      const knockoutPhases: TournamentPhase[] = [
        'round_of_32',
        'round_of_16',
        'quarter_finals',
        'semi_finals',
        'third_place',
        'final',
      ];

      for (const phase of knockoutPhases) {
        const result = validator.validateMatchWinner('draw', phase);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Draw is not a valid outcome for knockout matches');
      }
    });

    it('should reject invalid outcome values', () => {
      const result = validator.validateMatchWinner('invalid' as MatchOutcome, 'group_stage');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid outcome');
    });
  });

  describe('validateFinalScore', () => {
    it('should accept valid scores (0, 0)', () => {
      const result = validator.validateFinalScore(0, 0);
      expect(result).toEqual({ valid: true });
    });

    it('should accept valid scores (99, 99)', () => {
      const result = validator.validateFinalScore(99, 99);
      expect(result).toEqual({ valid: true });
    });

    it('should accept valid scores (3, 1)', () => {
      const result = validator.validateFinalScore(3, 1);
      expect(result).toEqual({ valid: true });
    });

    it('should reject negative team1Score', () => {
      const result = validator.validateFinalScore(-1, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject negative team2Score', () => {
      const result = validator.validateFinalScore(0, -1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject team1Score above 99', () => {
      const result = validator.validateFinalScore(100, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject team2Score above 99', () => {
      const result = validator.validateFinalScore(0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject non-integer team1Score', () => {
      const result = validator.validateFinalScore(1.5, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject non-integer team2Score', () => {
      const result = validator.validateFinalScore(0, 2.7);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal values must be integers between 0 and 99');
    });

    it('should reject NaN values', () => {
      const result = validator.validateFinalScore(NaN, 0);
      expect(result.valid).toBe(false);
    });

    it('should reject Infinity values', () => {
      const result = validator.validateFinalScore(Infinity, 0);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTournamentWinner', () => {
    it('should accept a valid participating team ID', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'TEAM#brazil', SK: 'METADATA', teamId: 'brazil', teamName: 'Brazil', group: 'A', fifaCode: 'BRA' },
      });

      const result = await validator.validateTournamentWinner('brazil');
      expect(result).toEqual({ valid: true });
    });

    it('should reject a non-participating team ID', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await validator.validateTournamentWinner('invalid-team');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Selected team is not a participating team');
    });

    it('should reject empty team ID', async () => {
      const result = await validator.validateTournamentWinner('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Team ID is required');
    });

    it('should reject whitespace-only team ID', async () => {
      const result = await validator.validateTournamentWinner('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Team ID is required');
    });
  });

  describe('isMatchOpen', () => {
    it('should return true for upcoming matches', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#m1', SK: 'METADATA', matchId: 'm1', status: 'upcoming' },
      });

      const result = await validator.isMatchOpen('m1');
      expect(result).toBe(true);
    });

    it('should return false for in_progress matches', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#m1', SK: 'METADATA', matchId: 'm1', status: 'in_progress' },
      });

      const result = await validator.isMatchOpen('m1');
      expect(result).toBe(false);
    });

    it('should return false for completed matches', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#m1', SK: 'METADATA', matchId: 'm1', status: 'completed' },
      });

      const result = await validator.isMatchOpen('m1');
      expect(result).toBe(false);
    });

    it('should return false for non-existent matches', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await validator.isMatchOpen('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('isTournamentWinnerOpen', () => {
    it('should return true when final match is upcoming', async () => {
      // First call: query for final phase
      mockSend.mockResolvedValueOnce({
        Items: [{ matchId: 'final-match-1' }],
      });
      // Second call: get the full match entity
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#final-match-1', SK: 'METADATA', matchId: 'final-match-1', status: 'upcoming', phase: 'final' },
      });

      const result = await validator.isTournamentWinnerOpen();
      expect(result).toBe(true);
    });

    it('should return false when final match is in_progress', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ matchId: 'final-match-1' }],
      });
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#final-match-1', SK: 'METADATA', matchId: 'final-match-1', status: 'in_progress', phase: 'final' },
      });

      const result = await validator.isTournamentWinnerOpen();
      expect(result).toBe(false);
    });

    it('should return false when final match is completed', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ matchId: 'final-match-1' }],
      });
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'MATCH#final-match-1', SK: 'METADATA', matchId: 'final-match-1', status: 'completed', phase: 'final' },
      });

      const result = await validator.isTournamentWinnerOpen();
      expect(result).toBe(false);
    });

    it('should return true when no final match exists yet', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await validator.isTournamentWinnerOpen();
      expect(result).toBe(true);
    });
  });
});

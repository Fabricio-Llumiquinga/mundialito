import { describe, it, expect } from 'vitest';
import {
  matchKey,
  matchMetadataSK,
  userKey,
  predictionKey,
  tournamentWinnerPredictionKey,
  predictionPrefix,
  phaseKey,
  phaseMatchSK,
  scoreKey,
  matchPredictionsKey,
  leaderboardGSIPK,
  leaderboardGSIKey,
  invertScore,
  parseMatchId,
  parseUserId,
  parsePredictionMatchId,
} from './keys';

describe('DynamoDB Key Generation Helpers', () => {
  describe('matchKey', () => {
    it('generates correct match PK', () => {
      expect(matchKey('m-2026-06-11-mex-usa')).toBe('MATCH#m-2026-06-11-mex-usa');
    });

    it('handles empty match ID', () => {
      expect(matchKey('')).toBe('MATCH#');
    });
  });

  describe('matchMetadataSK', () => {
    it('returns METADATA', () => {
      expect(matchMetadataSK()).toBe('METADATA');
    });
  });

  describe('userKey', () => {
    it('generates correct user PK', () => {
      expect(userKey('user-123')).toBe('USER#user-123');
    });

    it('handles email-style user IDs', () => {
      expect(userKey('alice@any2cloud.com')).toBe('USER#alice@any2cloud.com');
    });
  });

  describe('predictionKey', () => {
    it('generates correct prediction SK for a match', () => {
      expect(predictionKey('m-2026-06-11-mex-usa')).toBe('PRED#MATCH#m-2026-06-11-mex-usa');
    });
  });

  describe('tournamentWinnerPredictionKey', () => {
    it('returns the tournament winner SK', () => {
      expect(tournamentWinnerPredictionKey()).toBe('PRED#TOURNAMENT_WINNER');
    });
  });

  describe('predictionPrefix', () => {
    it('returns PRED# prefix for begins_with queries', () => {
      expect(predictionPrefix()).toBe('PRED#');
    });
  });

  describe('phaseKey', () => {
    it('generates phase PK without group', () => {
      expect(phaseKey('group_stage')).toBe('PHASE#group_stage');
    });

    it('generates phase PK with group', () => {
      expect(phaseKey('group_stage', 'A')).toBe('PHASE#group_stage#GROUP#A');
    });

    it('generates knockout phase PK', () => {
      expect(phaseKey('round_of_32')).toBe('PHASE#round_of_32');
    });
  });

  describe('phaseMatchSK', () => {
    it('generates chronologically sortable SK', () => {
      expect(phaseMatchSK('2026-06-11', 'm-001')).toBe('MATCH#2026-06-11#m-001');
    });

    it('sorts correctly by date', () => {
      const sk1 = phaseMatchSK('2026-06-11', 'm-001');
      const sk2 = phaseMatchSK('2026-06-12', 'm-002');
      expect(sk1 < sk2).toBe(true);
    });
  });

  describe('scoreKey', () => {
    it('returns SCORE', () => {
      expect(scoreKey()).toBe('SCORE');
    });
  });

  describe('matchPredictionsKey', () => {
    it('generates correct match predictions PK', () => {
      expect(matchPredictionsKey('m-2026-06-11-mex-usa')).toBe('MATCH_PREDS#m-2026-06-11-mex-usa');
    });
  });

  describe('leaderboardGSIPK', () => {
    it('returns LEADERBOARD', () => {
      expect(leaderboardGSIPK()).toBe('LEADERBOARD');
    });
  });

  describe('invertScore', () => {
    it('inverts zero to 99999', () => {
      expect(invertScore(0)).toBe('99999');
    });

    it('inverts 42 to 99957', () => {
      expect(invertScore(42)).toBe('99957');
    });

    it('inverts max score to 00000', () => {
      expect(invertScore(99999)).toBe('00000');
    });

    it('zero-pads small inverted values', () => {
      expect(invertScore(99990)).toBe('00009');
    });

    it('ensures higher scores produce lower inverted values', () => {
      const inv10 = invertScore(10);
      const inv50 = invertScore(50);
      // Higher score (50) should produce a lower inverted value (sorts first in ascending)
      expect(inv50 < inv10).toBe(true);
    });
  });

  describe('leaderboardGSIKey', () => {
    it('generates correct GSI1SK format', () => {
      expect(leaderboardGSIKey(42, 5, 'Alice')).toBe('SCORE#99957#99994#Alice');
    });

    it('generates correct GSI1SK for zero scores', () => {
      expect(leaderboardGSIKey(0, 0, 'Bob')).toBe('SCORE#99999#99999#Bob');
    });

    it('ensures higher scores sort first (ascending order)', () => {
      const alice = leaderboardGSIKey(100, 5, 'Alice');
      const bob = leaderboardGSIKey(50, 3, 'Bob');
      // Alice has higher score, so her GSI1SK should sort before Bob's
      expect(alice < bob).toBe(true);
    });

    it('breaks ties by exact score count (higher first)', () => {
      const alice = leaderboardGSIKey(100, 10, 'Alice');
      const bob = leaderboardGSIKey(100, 5, 'Bob');
      // Same score, Alice has more exact predictions, should sort first
      expect(alice < bob).toBe(true);
    });

    it('breaks ties by display name alphabetically', () => {
      const alice = leaderboardGSIKey(100, 5, 'Alice');
      const bob = leaderboardGSIKey(100, 5, 'Bob');
      // Same score and exact count, Alice sorts before Bob alphabetically
      expect(alice < bob).toBe(true);
    });
  });

  describe('Key Parsing Utilities', () => {
    describe('parseMatchId', () => {
      it('extracts match ID from PK', () => {
        expect(parseMatchId('MATCH#m-2026-06-11-mex-usa')).toBe('m-2026-06-11-mex-usa');
      });
    });

    describe('parseUserId', () => {
      it('extracts user ID from PK', () => {
        expect(parseUserId('USER#user-123')).toBe('user-123');
      });
    });

    describe('parsePredictionMatchId', () => {
      it('extracts match ID from prediction SK', () => {
        expect(parsePredictionMatchId('PRED#MATCH#m-2026-06-11-mex-usa')).toBe('m-2026-06-11-mex-usa');
      });
    });
  });
});

/**
 * Lambda entry point for GET /leaderboard.
 * Wraps createLeaderboardHandler to export a single `handler` function.
 */

import { createLeaderboardHandler } from '../handlers/leaderboard';

const leaderboardHandler = createLeaderboardHandler();

export const handler = leaderboardHandler.handleGetLeaderboard;

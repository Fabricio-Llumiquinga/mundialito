/**
 * Lambda entry point for GET /matches.
 * Wraps createMatchesHandler to export a single `handler` function.
 */

import { createMatchesHandler } from '../handlers/matches';

const matchesHandler = createMatchesHandler();

export const handler = matchesHandler.handleGetMatches;

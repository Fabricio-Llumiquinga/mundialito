/**
 * Lambda entry point for predictions endpoints.
 * Routes requests based on httpMethod and path to the correct handler.
 *
 * Endpoints:
 * - POST /predictions/match-winner
 * - POST /predictions/final-score
 * - POST /predictions/tournament-winner
 * - GET /predictions/me
 */

import { createPredictionsHandler } from '../handlers/predictions';

const predictionsHandler = createPredictionsHandler();

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  const method = event.httpMethod;
  const path: string = event.resource || event.path || '';

  if (method === 'GET' && path.includes('/me')) {
    return predictionsHandler.handleGetMyPredictions(event);
  }
  if (method === 'POST' && path.includes('match-winner')) {
    return predictionsHandler.handleMatchWinner(event);
  }
  if (method === 'POST' && path.includes('final-score')) {
    return predictionsHandler.handleFinalScore(event);
  }
  if (method === 'POST' && path.includes('tournament-winner')) {
    return predictionsHandler.handleTournamentWinner(event);
  }

  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Not found' }),
  };
};

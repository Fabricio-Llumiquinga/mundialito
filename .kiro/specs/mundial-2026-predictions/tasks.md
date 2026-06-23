# Implementation Plan: Mundial 2026 Predictions Portal

## Overview

This plan implements the Any2Cloud FIFA World Cup 2026 Predictions Portal as a serverless application on AWS. The implementation uses TypeScript throughout: React SPA frontend hosted on S3/CloudFront, Lambda functions behind API Gateway, DynamoDB single-table design, and Amazon Cognito for authentication. Tasks are ordered to build foundational infrastructure first, then core domain logic, then integration and wiring.

## Tasks

- [x] 1. Set up project structure and shared types
  - [x] 1.1 Initialize monorepo structure with shared TypeScript types and interfaces
    - Create directory structure: `packages/shared`, `packages/backend`, `packages/frontend`, `packages/infra`
    - Set up TypeScript project references and `tsconfig.json` for each package
    - Define all shared entity interfaces: `MatchEntity`, `PredictionEntity`, `UserScoreEntity`, `TeamEntity`, `PhaseIndexEntity`, `MatchPredictionsEntity`
    - Define shared enums: `TournamentPhase`, match status types, prediction types
    - Define API request/response interfaces: `MatchWinnerPredictionRequest`, `FinalScorePredictionRequest`, `TournamentWinnerPredictionRequest`, `MatchesResponse`, `LeaderboardResponse`, `UserPredictionsResponse`
    - _Requirements: 2.4, 2.5, 3.1, 3.2, 4.1, 5.1, 6.4, 7.2, 8.1_

  - [x] 1.2 Set up DynamoDB table definition and access utilities
    - Create DynamoDB table schema with PK/SK composite key and GSI1 (Leaderboard Index)
    - Implement key generation helpers: `matchKey()`, `userKey()`, `predictionKey()`, `phaseKey()`, `scoreKey()`, `leaderboardGSIKey()`
    - Implement the inverted score padding logic for GSI1SK (descending sort)
    - Set up DynamoDB DocumentClient wrapper with retry configuration (exponential backoff with jitter, 3 retries)
    - _Requirements: 7.3, 7.4, 10.4, 10.5_

  - [ ]* 1.3 Write property tests for DynamoDB key generation utilities
    - **Property 4: Prediction storage round-trip** — verify key generation produces consistent, reversible keys for all entity types
    - **Validates: Requirements 3.3, 4.2, 5.2**

- [x] 2. Implement authentication component
  - [x] 2.1 Implement Cognito Pre-Sign-Up Lambda trigger for domain validation
    - Create the Pre-Sign-Up Lambda handler that validates email domain
    - Implement `validateDomain(email)` function with case-insensitive check for `@any2cloud.com`
    - Return appropriate Cognito trigger response (autoConfirmUser, autoVerifyEmail)
    - Reject emails not matching the domain with a descriptive error
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for email domain validation
    - **Property 1: Email domain validation**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Implement frontend authentication flow with Cognito
    - Set up AWS Amplify Auth configuration for Cognito User Pool
    - Create login/signup pages with email and password fields
    - Implement session management (token storage, refresh, expiry detection)
    - Display appropriate error messages for invalid domain, network errors, and session expiry
    - Implement logout functionality that clears session and redirects to login
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. Implement match data ingestion component
  - [x] 3.1 Implement the MatchDataSource adapter interface and OpenFootball adapter
    - Define the `MatchDataSource` interface with `fetchMatches()` and `getName()` methods
    - Implement `OpenFootballAdapter` that fetches from the GitHub raw JSON endpoint
    - Parse the openfootball JSON format (rounds/matches structure) into `RawMatchData[]`
    - Generate stable match IDs from date + team combination
    - Map round names to `TournamentPhase` enum values
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Implement the ingestion service with validation and caching
    - Create `IngestionService` that orchestrates data fetch, validation, and storage
    - Validate each match record for required fields (team1, team2, date, time, venue)
    - Skip invalid records and collect them in `SkippedRecord[]` with reasons
    - Write valid matches to DynamoDB (both `MATCH#` and `PHASE#` entries)
    - Detect and store match results when `score.ft` is present
    - Implement idempotent writes using match ID as key
    - Log warnings for skipped records
    - _Requirements: 2.3, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.3 Write property test for match data validation
    - **Property 2: Match data validation rejects incomplete records**
    - **Validates: Requirements 2.8**

  - [x] 3.4 Create EventBridge-triggered ingestion Lambda handler
    - Create Lambda handler that instantiates `OpenFootballAdapter` and `IngestionService`
    - Configure EventBridge rule to trigger every 6 hours
    - Handle data source unavailability gracefully (return cached data, set stale flag)
    - Return `IngestionResult` with counts and skipped records
    - _Requirements: 2.6, 2.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement predictions component
  - [x] 5.1 Implement prediction validation service
    - Create `PredictionValidator` with methods: `validateMatchWinner()`, `validateFinalScore()`, `validateTournamentWinner()`
    - Implement `isMatchOpen(matchId)` — returns true only if match status is `upcoming`
    - Implement `isTournamentWinnerOpen()` — returns true only if the Final match status is `upcoming`
    - Validate match winner outcome by phase: allow `draw` only for group stage
    - Validate final score values: non-negative integers in range [0, 99]
    - Validate tournament winner team ID against the 48 participating teams
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 4.3, 4.5, 5.1, 5.4_

  - [ ]* 5.2 Write property tests for prediction validation
    - **Property 3: Prediction outcome validation by tournament phase**
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 5.3 Write property test for score value validation
    - **Property 7: Score value validation**
    - **Validates: Requirements 4.3**

  - [ ]* 5.4 Write property test for tournament winner team validation
    - **Property 8: Tournament winner team validation**
    - **Validates: Requirements 5.1**

  - [ ]* 5.5 Write property test for prediction deadline enforcement
    - **Property 6: Prediction deadline enforcement**
    - **Validates: Requirements 3.6, 4.5, 5.4**

  - [x] 5.6 Implement predictions Lambda handlers (CRUD operations)
    - Create `POST /predictions/match-winner` handler with validation and upsert logic
    - Create `POST /predictions/final-score` handler with validation and upsert logic
    - Create `POST /predictions/tournament-winner` handler with validation and upsert logic
    - Create `GET /predictions/me` handler to retrieve all user predictions
    - Use DynamoDB conditional expressions to prevent race conditions on upserts
    - Write to both `USER#` prediction entries and `MATCH_PREDS#` denormalized entries
    - Return confirmation messages on successful save
    - Return appropriate error responses (409 for closed predictions, 400 for invalid input)
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.7 Write property test for prediction upsert behavior
    - **Property 5: Prediction upsert replaces previous**
    - **Validates: Requirements 3.4**

  - [ ]* 5.8 Write property test for prediction storage round-trip
    - **Property 4: Prediction storage round-trip**
    - **Validates: Requirements 3.3, 4.2, 5.2**

- [x] 6. Implement scoring component
  - [x] 6.1 Implement scoring service logic
    - Create `ScoringService` with `scoreMatch()` and `scoreTournamentWinner()` methods
    - Award 3 points for correct match winner prediction
    - Award 5 additional points (total 8) for correct exact final score prediction
    - Award 10 points for correct tournament winner prediction
    - Award 0 points for incorrect or missing predictions
    - Handle knockout penalty shootout: evaluate winner prediction against penalty winner
    - Use atomic DynamoDB updates for score increments
    - Update `exactScoreCount` when exact score is correct
    - Ensure total score never goes below 0
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Write property test for scoring correctness
    - **Property 9: Scoring correctness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6**

  - [ ]* 6.3 Write property test for penalty shootout scoring
    - **Property 10: Penalty shootout scoring uses penalty winner**
    - **Validates: Requirements 6.7**

  - [x] 6.4 Create scoring Lambda handler triggered by match result updates
    - Create Lambda handler that processes match result confirmations
    - Query all predictions for the match from `MATCH_PREDS#` partition
    - Invoke `ScoringService.scoreMatch()` for each user's predictions
    - Update user score entities with new totals
    - Ensure scoring completes within 1 hour of result recording
    - Implement dead letter queue for failed scoring attempts
    - _Requirements: 6.5_

- [x] 7. Implement leaderboard component
  - [x] 7.1 Implement leaderboard Lambda handler with tiebreaker logic
    - Create `GET /leaderboard` handler
    - Query GSI1 with PK=`LEADERBOARD` to get all users sorted by inverted score
    - Compute rank positions: same rank for tied users (same score + same exact count)
    - Apply tiebreaker ordering: higher exact score count first, then alphabetical by display name
    - Mark current user's entry with `isCurrentUser: true`
    - Return `LeaderboardResponse` with all entries and current user rank
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 7.2 Write property test for leaderboard ordering
    - **Property 11: Leaderboard ordering with tiebreakers**
    - **Validates: Requirements 7.1, 7.3, 7.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement match schedule component
  - [x] 9.1 Implement match schedule Lambda handler with filtering and status computation
    - Create `GET /matches` handler with optional `phase` and `group` query parameters
    - Compute match status dynamically: `upcoming`, `in_progress`, or `completed`
    - Query by phase using `PHASE#` partition keys
    - Support group sub-filtering for group stage matches
    - Return matches in chronological ascending order by date
    - Include final score in response for completed matches
    - Return all 104 matches when no filters are applied
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.2 Write property test for match filtering
    - **Property 12: Match filtering returns correct subsets**
    - **Validates: Requirements 8.4, 8.5**

  - [ ]* 9.3 Write property test for match status computation
    - **Property 13: Match status computation**
    - **Validates: Requirements 8.2**

- [x] 10. Implement error handling and response sanitization
  - [x] 10.1 Implement global error handler middleware for Lambda functions
    - Create error handling middleware that wraps all Lambda handlers
    - Catch all unhandled exceptions and return generic error responses
    - Strip stack traces, internal file paths, database queries, and infrastructure identifiers from responses
    - Map known error types to appropriate HTTP status codes (400, 401, 403, 404, 409)
    - Return 500 with generic message for unknown errors
    - Log full error details to CloudWatch for debugging (not exposed to client)
    - _Requirements: 10.3_

  - [ ]* 10.2 Write property test for error response sanitization
    - **Property 14: Error response sanitization**
    - **Validates: Requirements 10.3**

- [x] 11. Implement React frontend application
  - [x] 11.1 Set up React SPA with routing and layout
    - Initialize React application with TypeScript
    - Set up React Router with routes: login, matches, predictions, leaderboard, dashboard
    - Create main layout with navigation bar and authenticated route guards
    - Configure API client with JWT token injection from Cognito session
    - _Requirements: 1.1, 10.2_

  - [x] 11.2 Implement match schedule view
    - Create match list page displaying all 104 matches organized by phase and date
    - Show for each match: teams, date, time, venue, and status indicator
    - Display final score for completed matches
    - Implement phase filter dropdown (Group Stage, Round of 32, etc.)
    - Implement group sub-filter (A through L) when Group Stage is selected
    - Style match status indicators: upcoming (neutral), in progress (active), completed (done)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 11.3 Implement prediction submission forms
    - Create match winner prediction form with radio buttons (Team A, Team B, Draw for group stage; Team A, Team B for knockout)
    - Create final score prediction form with numeric inputs (0-99 validation)
    - Create tournament winner prediction with team selector dropdown (48 teams)
    - Show confirmation message on successful submission
    - Show error messages for closed predictions and invalid inputs
    - Disable forms for matches that have started or completed
    - Pre-populate forms with existing predictions for editing
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 4.1, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 11.4 Implement leaderboard view
    - Create leaderboard page showing ranked list of all users
    - Display rank, display name, and total score for each user
    - Visually highlight the current authenticated user's row
    - Handle tied ranks display (same rank number for tied users)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

  - [x] 11.5 Implement user predictions dashboard
    - Create personal dashboard showing all submitted predictions
    - Organize predictions by match date in chronological order
    - Display for each prediction: teams, date, phase, predicted outcome, actual result, points earned
    - Show total score and current leaderboard rank at the top
    - Visually distinguish pending predictions (upcoming matches) from resolved ones (completed matches)
    - Indicate correct/incorrect status for resolved predictions
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement AWS infrastructure and deployment
  - [x] 13.1 Create IaC definitions for all AWS resources
    - Define DynamoDB table with GSI1 and provisioned/on-demand capacity
    - Define Cognito User Pool with email sign-up, domain restriction trigger
    - Define API Gateway REST API with Cognito authorizer
    - Define Lambda functions for: matches, predictions, scoring, leaderboard, ingestion, pre-sign-up
    - Define S3 bucket for SPA static hosting
    - Define CloudFront distribution with ACM certificate (HTTPS)
    - Define EventBridge rule for 6-hour ingestion schedule
    - Define IAM roles and policies with least-privilege access
    - Define dead letter queue for scoring Lambda failures
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [x] 13.2 Wire API Gateway routes to Lambda functions
    - Configure routes: `GET /matches`, `POST /predictions/match-winner`, `POST /predictions/final-score`, `POST /predictions/tournament-winner`, `GET /predictions/me`, `GET /leaderboard`
    - Attach Cognito authorizer to all routes
    - Configure CORS for SPA origin
    - Set up request/response mappings
    - _Requirements: 10.1, 10.5_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 14 universal correctness properties defined in the design document using fast-check
- Unit tests validate specific examples and edge cases
- The DynamoDB single-table design uses inverted scores in GSI1SK for descending leaderboard sort
- The data abstraction layer (adapter pattern) ensures the openfootball source can be swapped for an external API later
- All Lambda handlers share the error handling middleware for consistent response sanitization

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["5.7", "5.8", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 8, "tasks": ["7.2", "9.1", "10.1"] },
    { "id": 9, "tasks": ["9.2", "9.3", "10.2", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["13.1"] },
    { "id": 12, "tasks": ["13.2"] }
  ]
}
```

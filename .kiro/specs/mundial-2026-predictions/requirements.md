# Requirements Document

## Introduction

This document defines the requirements for the Any2Cloud FIFA World Cup 2026 Predictions Portal — a web application where company employees can predict match outcomes, final scores, and the tournament winner. The portal includes a scoring system and leaderboard to foster friendly competition among participants. The tournament spans 104 matches across 12 groups (48 teams) hosted in the USA, Mexico, and Canada from June 11 to July 19, 2026. Match data is sourced from the openfootball/worldcup.json repository. The system is deployed on AWS and restricted to employees with @any2cloud.com email addresses.

## Glossary

- **Portal**: The web application that serves as the FIFA World Cup 2026 Predictions platform for Any2Cloud employees
- **User**: An authenticated Any2Cloud employee who interacts with the Portal
- **Prediction**: A forecast submitted by a User for a specific match or tournament outcome
- **Match**: A single FIFA World Cup 2026 game between two teams, sourced from the openfootball data
- **Group_Stage**: The first phase of the tournament consisting of 72 matches across 12 groups (A through L)
- **Knockout_Stage**: The elimination phase consisting of 32 matches (Round of 32, Round of 16, Quarter-finals, Semi-finals, Third Place, and Final)
- **Leaderboard**: A ranked list of all Users ordered by their total prediction score
- **Scoring_System**: The rules engine that calculates points awarded to Users based on prediction accuracy
- **Authentication_Service**: The component responsible for verifying user identity and email domain
- **Match_Data_Source**: The configurable data provider for match schedules and results. Initially the openfootball/worldcup.json GitHub repository, to be replaced by an external API in a future phase

## Requirements

### Requirement 1: User Authentication

**User Story:** As an Any2Cloud employee, I want to log in with my company email, so that I can access the predictions portal securely.

#### Acceptance Criteria

1. WHEN a user attempts to access the Portal, THE Authentication_Service SHALL require the user to authenticate before granting access to any Portal functionality
2. WHEN a user authenticates with a valid @any2cloud.com email address, THE Authentication_Service SHALL grant access to the Portal and establish an authenticated session
3. WHEN a user attempts to authenticate with an email address that does not belong to the @any2cloud.com domain, THE Authentication_Service SHALL deny access and display a message indicating that only Any2Cloud employees can access the Portal
4. IF the Authentication_Service is unable to verify a user's identity due to a network or service error, THEN THE Portal SHALL display an error message describing the issue and prevent access to protected resources
5. WHEN an authenticated session expires or the user explicitly logs out, THE Authentication_Service SHALL terminate the session and require re-authentication for subsequent access

### Requirement 2: Match Data Ingestion

**User Story:** As a system administrator, I want the portal to load match data from a configurable data source, so that users can see all 104 World Cup matches available for predictions.

#### Acceptance Criteria

1. THE Portal SHALL consume match data through a data abstraction layer that decouples the Portal from the specific data source implementation, allowing the openfootball/worldcup.json repository to be replaced by an external API without requiring changes to the Portal's core logic
2. THE Portal SHALL use the openfootball/worldcup.json repository as the initial Match_Data_Source for this phase of development
3. THE Portal SHALL load all 104 matches of the FIFA World Cup 2026 from the configured Match_Data_Source
4. THE Portal SHALL display match data organized by tournament phase: Group Stage (72 matches), Round of 32 (16 matches), Round of 16 (8 matches), Quarter-finals (4 matches), Semi-finals (2 matches), Third Place (1 match), and Final (1 match)
5. THE Portal SHALL display for each match: the two competing teams, the match date, the match time, and the venue
6. WHEN match results become available in the Match_Data_Source, THE Portal SHALL update the stored match results within 24 hours
7. IF the Match_Data_Source is unavailable or returns an error, THEN THE Portal SHALL display the most recently cached match data and indicate to the user that data may not be current
8. IF a match record from the Match_Data_Source is missing required fields (teams, date, time, or venue), THEN THE Portal SHALL skip that record and log a warning for administrative review

### Requirement 3: Match Winner Prediction

**User Story:** As a user, I want to predict the winner of each match, so that I can earn points based on my football knowledge.

#### Acceptance Criteria

1. WHEN a User selects a Group_Stage match that has not yet started, THE Portal SHALL allow the User to submit a Prediction for the match winner (Team A wins, Team B wins, or Draw)
2. WHEN a User selects a Knockout_Stage match that has not yet started, THE Portal SHALL allow the User to submit a Prediction for the match winner (Team A wins or Team B wins only, since knockout matches must produce a winner)
3. WHEN a User submits a match winner Prediction, THE Portal SHALL store the Prediction with the User identifier, match identifier, and selected outcome, and display a confirmation indicating the Prediction was saved successfully
4. THE Portal SHALL allow only one match winner Prediction per User per match; submitting a new Prediction SHALL replace the previous one
5. WHILE a match has not yet started, THE Portal SHALL allow the User to update a previously submitted match winner Prediction
6. WHEN a match has started or is completed, THE Portal SHALL prevent the User from submitting or modifying a match winner Prediction for that match
7. IF a User attempts to submit a match winner Prediction for a match that has already started, THEN THE Portal SHALL display a message indicating that predictions are closed for that match

### Requirement 4: Final Score Prediction

**User Story:** As a user, I want to predict the final score of each match, so that I can earn bonus points for exact score predictions.

#### Acceptance Criteria

1. WHEN a User selects a match that has not yet started, THE Portal SHALL allow the User to submit a Prediction for the final score (goals for each team)
2. WHEN a User submits a final score Prediction, THE Portal SHALL store the Prediction with the User identifier, match identifier, and predicted score for each team
3. THE Portal SHALL accept only non-negative integer values between 0 and 99 inclusive for predicted goal counts
4. WHILE a match has not yet started, THE Portal SHALL allow the User to update a previously submitted final score Prediction
5. WHEN a match has started or is completed, THE Portal SHALL prevent the User from submitting or modifying a final score Prediction for that match and SHALL display a message indicating that predictions are closed for that match
6. IF a User submits a final score Prediction with a value that is not a non-negative integer between 0 and 99, THEN THE Portal SHALL reject the submission and display a message indicating the valid range for goal values

### Requirement 5: Tournament Winner Prediction

**User Story:** As a user, I want to predict which team will win the entire World Cup, so that I can earn bonus points for correctly predicting the champion.

#### Acceptance Criteria

1. THE Portal SHALL allow each User to submit exactly one Prediction for the overall tournament winner from the list of 48 participating teams
2. WHEN a User submits a tournament winner Prediction, THE Portal SHALL store the Prediction with the User identifier and selected team, and display a confirmation indicating the Prediction was saved successfully
3. WHILE the Final match has not yet started, THE Portal SHALL allow the User to update the tournament winner Prediction by selecting a different team from the list of 48 participating teams
4. IF the Final match has started or is completed, THEN THE Portal SHALL prevent the User from submitting or modifying the tournament winner Prediction and display a message indicating that tournament winner predictions are closed
5. WHEN a User navigates to the tournament winner Prediction section, THE Portal SHALL display the User's current tournament winner Prediction if one has been previously submitted

### Requirement 6: Scoring System

**User Story:** As a user, I want to earn points for correct predictions, so that I can compete with my colleagues on the leaderboard.

#### Acceptance Criteria

1. WHEN a match result is confirmed, THE Scoring_System SHALL award 3 points to each User who correctly predicted the match winner (Team A wins, Team B wins, or Draw based on the result at the end of regular time including any extra time, but excluding penalty shootout outcomes)
2. WHEN a match result is confirmed, THE Scoring_System SHALL award 5 additional points (in addition to the 3 match winner points) to each User who correctly predicted the exact final score at the end of regular time including any extra time, but excluding goals scored during a penalty shootout
3. WHEN the tournament winner is confirmed after the Final match, THE Scoring_System SHALL award 10 points to each User who correctly predicted the tournament winner
4. THE Scoring_System SHALL calculate each User's total score as the sum of all points earned across match winner predictions, final score predictions, and the tournament winner prediction, with a minimum total score of 0
5. WHEN a match result is confirmed, THE Scoring_System SHALL update affected User scores within 1 hour of the result being recorded in the Portal
6. IF a User did not submit a Prediction for a given match or prediction type, THEN THE Scoring_System SHALL award 0 points to that User for that match or prediction type
7. IF a match in the Knockout_Stage ends in a draw at the end of extra time and is decided by penalty shootout, THEN THE Scoring_System SHALL evaluate the match winner Prediction based on the team that won the penalty shootout

### Requirement 7: Leaderboard

**User Story:** As a user, I want to see a leaderboard ranking all participants, so that I can track my position relative to my colleagues.

#### Acceptance Criteria

1. THE Portal SHALL display a Leaderboard showing all Users ranked by total score in descending order
2. THE Leaderboard SHALL display for each User: rank position, user display name, and total score
3. WHEN two or more Users have the same total score, THE Portal SHALL rank them by the number of correct exact score predictions in descending order as a tiebreaker
4. IF two or more Users have the same total score and the same number of correct exact score predictions, THEN THE Portal SHALL assign them the same rank position and order them alphabetically by display name
5. WHEN a User's score is updated, THE Leaderboard SHALL reflect the updated rankings within 5 minutes
6. THE Portal SHALL allow any authenticated User to view the Leaderboard at any time
7. THE Portal SHALL visually distinguish the current authenticated User's row on the Leaderboard from other Users' rows

### Requirement 8: Match Schedule View

**User Story:** As a user, I want to browse the match schedule, so that I can plan my predictions and follow the tournament progress.

#### Acceptance Criteria

1. THE Portal SHALL display all 104 matches organized by tournament phase and match date in chronological ascending order, showing for each match: the two competing teams, match date, match time, venue, and match status
2. THE Portal SHALL indicate each match status as one of: "upcoming" (current time is before the scheduled match start time), "in progress" (current time is at or after the scheduled match start time and no final result has been recorded), or "completed" (a final result has been recorded for the match)
3. WHEN a match is completed, THE Portal SHALL display the final score alongside the match details
4. THE Portal SHALL allow Users to filter matches by tournament phase (Group Stage, Round of 32, Round of 16, Quarter-finals, Semi-finals, Third Place, Final)
5. WHEN a User selects the Group Stage phase filter, THE Portal SHALL allow the User to further filter matches by group (A through L)
6. WHEN no filters are applied, THE Portal SHALL display all 104 matches across all tournament phases

### Requirement 9: User Predictions Dashboard

**User Story:** As a user, I want to see a summary of all my predictions and their outcomes, so that I can track my performance throughout the tournament.

#### Acceptance Criteria

1. THE Portal SHALL provide each User with a personal dashboard displaying all submitted Predictions (match winner, final score, and tournament winner) organized by match date in chronological order
2. THE Portal SHALL display for each match Prediction: the competing teams, match date, tournament phase, the predicted outcome, the points earned, and the actual result (when the match is completed)
3. WHEN a match result is confirmed, THE Portal SHALL indicate on the User's dashboard whether each Prediction for that match was correct or incorrect
4. THE Portal SHALL display the User's total score and current Leaderboard rank on the dashboard
5. THE Portal SHALL visually distinguish between Predictions for upcoming matches (pending) and Predictions for completed matches (resolved)

### Requirement 10: AWS Deployment

**User Story:** As a system administrator, I want the portal deployed on AWS, so that it is reliable, scalable, and accessible to all Any2Cloud employees.

#### Acceptance Criteria

1. THE Portal SHALL be deployed on AWS infrastructure
2. THE Portal SHALL be accessible via HTTPS with a valid TLS certificate
3. IF the Portal experiences an unexpected error, THEN THE Portal SHALL return a generic error response indicating that an error occurred without exposing stack traces, internal file paths, database queries, or infrastructure identifiers
4. THE Portal SHALL maintain at least 99.9% uptime during the tournament period from June 11 to July 19, 2026, where uptime is defined as the Portal responding to authenticated requests within 10 seconds
5. WHILE the Portal is available, THE Portal SHALL respond to any user request within 5 seconds under normal operating conditions of up to 100 concurrent users

import {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
  type SignUpInput,
} from 'aws-amplify/auth';

/**
 * Error types that can occur during authentication operations.
 */
export type AuthErrorType =
  | 'INVALID_DOMAIN'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'SESSION_EXPIRED'
  | 'USER_EXISTS'
  | 'UNKNOWN';

export interface AuthError {
  type: AuthErrorType;
  message: string;
}

export interface AuthSession {
  accessToken: string;
  idToken: string;
  expiresAt: number;
}

export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * Maps Amplify/Cognito error codes to our AuthError types.
 */
function mapAuthError(error: unknown): AuthError {
  if (error instanceof Error) {
    const message = error.message;
    const name = error.name;

    // Domain validation error from Pre-Sign-Up trigger
    if (
      message.includes('Only Any2Cloud employees') ||
      name === 'PreSignUpValidationException' ||
      message.includes('PreSignUp')
    ) {
      return {
        type: 'INVALID_DOMAIN',
        message: 'Only Any2Cloud employees can access the Portal',
      };
    }

    // Invalid credentials
    if (
      name === 'NotAuthorizedException' ||
      name === 'UserNotFoundException' ||
      message.includes('Incorrect username or password')
    ) {
      return {
        type: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      };
    }

    // User already exists
    if (name === 'UsernameExistsException') {
      return {
        type: 'USER_EXISTS',
        message: 'An account with this email already exists',
      };
    }

    // Network errors
    if (
      name === 'NetworkError' ||
      message.includes('Network') ||
      message.includes('fetch')
    ) {
      return {
        type: 'NETWORK_ERROR',
        message: 'Unable to connect. Please check your internet connection and try again.',
      };
    }

    // Session expired
    if (
      name === 'TokenExpiredException' ||
      message.includes('expired') ||
      message.includes('refresh')
    ) {
      return {
        type: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      };
    }
  }

  return {
    type: 'UNKNOWN',
    message: 'An unexpected error occurred. Please try again.',
  };
}

/**
 * Signs in a user with email and password.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  try {
    const input: SignInInput = {
      username: email,
      password,
    };
    await signIn(input);
    return getCurrentAuthUser();
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Registers a new user with email and password.
 * The Cognito Pre-Sign-Up trigger validates the @any2cloud.com domain.
 */
export async function register(email: string, password: string): Promise<void> {
  try {
    const input: SignUpInput = {
      username: email,
      password,
      options: {
        userAttributes: {
          email,
        },
      },
    };
    await signUp(input);
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Signs out the current user and clears the session.
 */
export async function logout(): Promise<void> {
  try {
    await signOut();
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Gets the currently authenticated user.
 * Throws SESSION_EXPIRED if no valid session exists.
 */
export async function getCurrentAuthUser(): Promise<AuthUser> {
  try {
    const user = await getCurrentUser();
    return {
      userId: user.userId,
      email: user.signInDetails?.loginId ?? user.username,
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Fetches the current auth session (tokens).
 * Returns null if no valid session exists.
 * Amplify v6 handles token refresh automatically.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    const session = await fetchAuthSession();
    const tokens = session.tokens;

    if (!tokens?.accessToken || !tokens?.idToken) {
      return null;
    }

    const accessToken = tokens.accessToken.toString();
    const idToken = tokens.idToken.toString();
    const expiresAt = tokens.accessToken.payload.exp
      ? tokens.accessToken.payload.exp * 1000
      : Date.now() + 3600000;

    return { accessToken, idToken, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Checks if the current session is valid (not expired).
 */
export async function isSessionValid(): Promise<boolean> {
  const session = await getAuthSession();
  if (!session) return false;
  return session.expiresAt > Date.now();
}

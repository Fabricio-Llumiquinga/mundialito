import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock aws-amplify/auth module
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

import { signIn, signUp, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import {
  login,
  register,
  logout,
  getCurrentAuthUser,
  getAuthSession,
  isSessionValid,
} from './auth-service';
import type { AuthError } from './auth-service';

describe('auth-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should sign in and return the user on success', async () => {
      vi.mocked(signIn).mockResolvedValue({
        isSignedIn: true,
        nextStep: { signInStep: 'DONE' },
      });
      vi.mocked(getCurrentUser).mockResolvedValue({
        userId: 'user-123',
        username: 'test@any2cloud.com',
        signInDetails: { loginId: 'test@any2cloud.com', authFlowType: 'USER_SRP_AUTH' },
      });

      const user = await login('test@any2cloud.com', 'password123');

      expect(signIn).toHaveBeenCalledWith({
        username: 'test@any2cloud.com',
        password: 'password123',
      });
      expect(user).toEqual({
        userId: 'user-123',
        email: 'test@any2cloud.com',
      });
    });

    it('should throw INVALID_CREDENTIALS for wrong password', async () => {
      vi.mocked(signIn).mockRejectedValue(
        Object.assign(new Error('Incorrect username or password'), {
          name: 'NotAuthorizedException',
        })
      );

      try {
        await login('test@any2cloud.com', 'wrong');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.type).toBe('INVALID_CREDENTIALS');
        expect(authErr.message).toBe('Invalid email or password');
      }
    });

    it('should throw NETWORK_ERROR for network failures', async () => {
      vi.mocked(signIn).mockRejectedValue(
        Object.assign(new Error('Network error'), { name: 'NetworkError' })
      );

      try {
        await login('test@any2cloud.com', 'password');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.type).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('register', () => {
    it('should sign up a user successfully', async () => {
      vi.mocked(signUp).mockResolvedValue({
        isSignUpComplete: true,
        userId: 'user-456',
        nextStep: { signUpStep: 'DONE' },
      });

      await expect(register('new@any2cloud.com', 'password123')).resolves.toBeUndefined();

      expect(signUp).toHaveBeenCalledWith({
        username: 'new@any2cloud.com',
        password: 'password123',
        options: {
          userAttributes: { email: 'new@any2cloud.com' },
        },
      });
    });

    it('should throw INVALID_DOMAIN when Pre-Sign-Up trigger rejects', async () => {
      vi.mocked(signUp).mockRejectedValue(
        Object.assign(
          new Error('PreSignUp failed with error Only Any2Cloud employees can access the Portal'),
          { name: 'PreSignUpValidationException' }
        )
      );

      try {
        await register('user@gmail.com', 'password123');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.type).toBe('INVALID_DOMAIN');
        expect(authErr.message).toBe('Only Any2Cloud employees can access the Portal');
      }
    });

    it('should throw USER_EXISTS when email is already registered', async () => {
      vi.mocked(signUp).mockRejectedValue(
        Object.assign(new Error('User already exists'), {
          name: 'UsernameExistsException',
        })
      );

      try {
        await register('existing@any2cloud.com', 'password123');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.type).toBe('USER_EXISTS');
        expect(authErr.message).toBe('An account with this email already exists');
      }
    });
  });

  describe('logout', () => {
    it('should call signOut', async () => {
      vi.mocked(signOut).mockResolvedValue(undefined);
      await expect(logout()).resolves.toBeUndefined();
      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('getCurrentAuthUser', () => {
    it('should return the current user', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        userId: 'user-789',
        username: 'user@any2cloud.com',
        signInDetails: { loginId: 'user@any2cloud.com', authFlowType: 'USER_SRP_AUTH' },
      });

      const user = await getCurrentAuthUser();
      expect(user).toEqual({
        userId: 'user-789',
        email: 'user@any2cloud.com',
      });
    });

    it('should throw when no user is signed in', async () => {
      vi.mocked(getCurrentUser).mockRejectedValue(
        Object.assign(new Error('Token expired'), { name: 'TokenExpiredException' })
      );

      try {
        await getCurrentAuthUser();
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.type).toBe('SESSION_EXPIRED');
      }
    });
  });

  describe('getAuthSession', () => {
    it('should return session tokens when authenticated', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: {
          accessToken: {
            toString: () => 'access-token-value',
            payload: { exp: futureExp },
          },
          idToken: {
            toString: () => 'id-token-value',
            payload: {},
          },
        },
      } as any);

      const session = await getAuthSession();
      expect(session).not.toBeNull();
      expect(session!.accessToken).toBe('access-token-value');
      expect(session!.idToken).toBe('id-token-value');
      expect(session!.expiresAt).toBe(futureExp * 1000);
    });

    it('should return null when no tokens exist', async () => {
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: undefined,
      } as any);

      const session = await getAuthSession();
      expect(session).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(fetchAuthSession).mockRejectedValue(new Error('No session'));

      const session = await getAuthSession();
      expect(session).toBeNull();
    });
  });

  describe('isSessionValid', () => {
    it('should return true when session is not expired', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: {
          accessToken: {
            toString: () => 'token',
            payload: { exp: futureExp },
          },
          idToken: {
            toString: () => 'id-token',
            payload: {},
          },
        },
      } as any);

      const valid = await isSessionValid();
      expect(valid).toBe(true);
    });

    it('should return false when session is expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: {
          accessToken: {
            toString: () => 'token',
            payload: { exp: pastExp },
          },
          idToken: {
            toString: () => 'id-token',
            payload: {},
          },
        },
      } as any);

      const valid = await isSessionValid();
      expect(valid).toBe(false);
    });

    it('should return false when no session exists', async () => {
      vi.mocked(fetchAuthSession).mockResolvedValue({
        tokens: undefined,
      } as any);

      const valid = await isSessionValid();
      expect(valid).toBe(false);
    });
  });
});

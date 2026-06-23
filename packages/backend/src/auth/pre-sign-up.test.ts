import { describe, it, expect } from 'vitest';
import { validateDomain, handler, CognitoPreSignUpEvent } from './pre-sign-up';

describe('validateDomain', () => {
  it('accepts a valid @any2cloud.com email', () => {
    expect(validateDomain('user@any2cloud.com')).toBe(true);
  });

  it('accepts uppercase domain variations', () => {
    expect(validateDomain('user@Any2Cloud.com')).toBe(true);
    expect(validateDomain('user@ANY2CLOUD.COM')).toBe(true);
    expect(validateDomain('user@Any2Cloud.COM')).toBe(true);
  });

  it('accepts mixed case local part with valid domain', () => {
    expect(validateDomain('John.Doe@any2cloud.com')).toBe(true);
  });

  it('rejects emails from other domains', () => {
    expect(validateDomain('user@gmail.com')).toBe(false);
    expect(validateDomain('user@other.com')).toBe(false);
    expect(validateDomain('user@any2cloud.org')).toBe(false);
  });

  it('rejects emails with domain as substring', () => {
    expect(validateDomain('user@notany2cloud.com')).toBe(false);
    expect(validateDomain('user@any2cloud.com.evil.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateDomain('')).toBe(false);
  });

  it('rejects email without @ symbol', () => {
    expect(validateDomain('userany2cloud.com')).toBe(false);
  });
});

describe('handler', () => {
  function createEvent(email: string): CognitoPreSignUpEvent {
    return {
      request: {
        userAttributes: { email },
      },
      response: {
        autoConfirmUser: false,
        autoVerifyEmail: false,
      },
    };
  }

  it('auto-confirms and auto-verifies valid domain users', async () => {
    const event = createEvent('employee@any2cloud.com');
    const result = await handler(event);

    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it('throws an error for invalid domain emails', async () => {
    const event = createEvent('user@gmail.com');

    await expect(handler(event)).rejects.toThrow(
      'Only Any2Cloud employees can access the Portal'
    );
  });

  it('handles case-insensitive domain in handler', async () => {
    const event = createEvent('user@ANY2CLOUD.COM');
    const result = await handler(event);

    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(true);
  });
});

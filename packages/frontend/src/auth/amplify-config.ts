import { Amplify } from 'aws-amplify';

/**
 * AWS Amplify configuration for Cognito User Pool authentication.
 * Supports email/password and Microsoft federated login.
 */
export function configureAmplify(): void {
  const useMocks = import.meta.env?.VITE_USE_MOCKS === 'true';
  if (useMocks) return;

  try {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
          userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
          loginWith: {
            oauth: {
              domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
              scopes: ['openid', 'email', 'profile'],
              redirectSignIn: [import.meta.env.VITE_COGNITO_REDIRECT_URL ?? 'http://localhost:3000'],
              redirectSignOut: [import.meta.env.VITE_COGNITO_REDIRECT_URL ?? 'http://localhost:3000'],
              responseType: 'code',
              providers: [{ custom: 'Microsoft' }],
            },
          },
        },
      },
    });
  } catch {
    console.warn('[Amplify] Failed to configure - running without auth');
  }
}

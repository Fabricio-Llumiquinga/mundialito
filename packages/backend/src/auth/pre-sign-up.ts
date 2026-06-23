/**
 * Cognito Pre-Sign-Up Lambda trigger for email domain validation.
 * Ensures only @any2cloud.com email addresses can register.
 * Auto-confirms users coming from federated identity providers (Microsoft).
 */

export interface CognitoPreSignUpEvent {
  triggerSource?: string;
  request: {
    userAttributes: {
      email?: string;
    };
  };
  response: {
    autoConfirmUser: boolean;
    autoVerifyEmail: boolean;
  };
}

const ALLOWED_DOMAIN = '@any2cloud.com';

/**
 * Validates that the given email belongs to the @any2cloud.com domain.
 * Performs a case-insensitive check on the domain portion.
 */
export function validateDomain(email: string): boolean {
  if (!email) return false;
  const lowerEmail = email.toLowerCase();
  return lowerEmail.endsWith(ALLOWED_DOMAIN);
}

/**
 * Cognito Pre-Sign-Up Lambda handler.
 * 
 * - For federated users (Microsoft OIDC): auto-confirm without domain check
 *   (Azure AD already restricts to the tenant)
 * - For direct sign-up: validates @any2cloud.com domain
 */
export async function handler(event: CognitoPreSignUpEvent): Promise<CognitoPreSignUpEvent> {
  const triggerSource = event.triggerSource ?? '';

  // If user comes from an external provider (Microsoft), auto-confirm
  // triggerSource will be "PreSignUp_ExternalProvider" for federated users
  if (triggerSource === 'PreSignUp_ExternalProvider') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
    return event;
  }

  // For direct sign-up, validate email domain
  const email = event.request.userAttributes.email ?? '';

  if (!validateDomain(email)) {
    throw new Error('Solo colaboradores @any2cloud.com pueden acceder al portal');
  }

  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  return event;
}

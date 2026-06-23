export { configureAmplify } from './amplify-config';
export { AuthProvider, useAuth } from './auth-context';
export { ProtectedRoute } from './ProtectedRoute';
export {
  login,
  register,
  logout,
  getCurrentAuthUser,
  getAuthSession,
  isSessionValid,
} from './auth-service';
export type { AuthError, AuthErrorType, AuthSession, AuthUser } from './auth-service';

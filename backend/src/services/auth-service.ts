import type { UserRepository, UserSummary } from '../repositories/user-repository';
import { logger as defaultLogger } from '../lib/logger';
import type { AppLogger } from '../lib/logger-types';

export interface AuthService {
  startAuth: (email: string) => Promise<void>;
  completeMagicLink: (token: string) => Promise<{ sessionToken: string }>;
  getCurrentUser: (userId: string) => Promise<UserSummary | null>;
}

export interface AuthServiceDeps {
  userRepository: UserRepository;
  jwt: {
    generateMagicLinkToken: (userId: string) => Promise<string>;
    generateSessionToken: (userId: string, email: string) => Promise<string>;
    verifyMagicLinkToken: (token: string) => Promise<{ userId: string }>;
  };
  email: {
    sendMagicLinkEmail: (email: string, token: string) => Promise<void>;
  };
  billingSync: {
    syncUserSubscriptionByEmail: (input: { userId: string; email: string }) => Promise<void>;
  };
  logger?: Pick<AppLogger, 'warn'>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const serviceLogger = deps.logger ?? defaultLogger;

  async function startAuth(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const { user } = await deps.userRepository.getOrCreateUserByEmail(normalizedEmail);

    try {
      await deps.billingSync.syncUserSubscriptionByEmail({
        userId: user.id,
        email: normalizedEmail,
      });
    } catch (error) {
      serviceLogger.warn('billing_reconciliation_failed_during_auth_start', {
        userId: user.id,
        error,
      });
    }

    const token = await deps.jwt.generateMagicLinkToken(user.id);
    await deps.email.sendMagicLinkEmail(normalizedEmail, token);
  }

  async function completeMagicLink(token: string): Promise<{ sessionToken: string }> {
    const { userId } = await deps.jwt.verifyMagicLinkToken(token);
    const user = await deps.userRepository.findUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const sessionToken = await deps.jwt.generateSessionToken(user.id, user.email);
    return { sessionToken };
  }

  async function getCurrentUser(userId: string): Promise<UserSummary | null> {
    return deps.userRepository.findUserById(userId);
  }

  return {
    startAuth,
    completeMagicLink,
    getCurrentUser,
  };
}

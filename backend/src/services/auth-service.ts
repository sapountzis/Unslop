import type { UserRepository, UserSummary } from '../repositories/user-repository';

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
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  async function startAuth(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await deps.userRepository.getOrCreateUserByEmail(normalizedEmail);
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

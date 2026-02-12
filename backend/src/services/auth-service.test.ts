import { describe, expect, it, mock } from 'bun:test';
import { createAuthService } from './auth-service';

describe('auth service startAuth billing reconciliation', () => {
  it('syncs billing data when user is newly created', async () => {
    const getOrCreateUserByEmail = mock(async () => ({
      user: { id: 'u-new', email: 'user@example.com', plan: 'free', planStatus: 'inactive' },
      isNew: true,
    }));
    const generateMagicLinkToken = mock(async () => 'magic-token');
    const sendMagicLinkEmail = mock(async () => undefined);
    const syncUserSubscriptionByEmail = mock(async () => undefined);

    const service = createAuthService({
      userRepository: {
        getOrCreateUserByEmail,
        findUserById: mock(async () => null),
      },
      jwt: {
        generateMagicLinkToken,
        generateSessionToken: mock(async () => 'session-token'),
        verifyMagicLinkToken: mock(async () => ({ userId: 'u-new' })),
      },
      email: {
        sendMagicLinkEmail,
      },
      billingSync: {
        syncUserSubscriptionByEmail,
      },
      logger: {
        warn: mock(() => undefined),
      },
    });

    await service.startAuth('USER@example.com ');

    expect(syncUserSubscriptionByEmail).toHaveBeenCalledWith({
      userId: 'u-new',
      email: 'user@example.com',
    });
    expect(generateMagicLinkToken).toHaveBeenCalledWith('u-new');
    expect(sendMagicLinkEmail).toHaveBeenCalledWith('user@example.com', 'magic-token');
  });

  it('does not sync billing data for existing user', async () => {
    const getOrCreateUserByEmail = mock(async () => ({
      user: { id: 'u-existing', email: 'user@example.com', plan: 'pro', planStatus: 'active' },
      isNew: false,
    }));
    const syncUserSubscriptionByEmail = mock(async () => undefined);

    const service = createAuthService({
      userRepository: {
        getOrCreateUserByEmail,
        findUserById: mock(async () => null),
      },
      jwt: {
        generateMagicLinkToken: mock(async () => 'magic-token'),
        generateSessionToken: mock(async () => 'session-token'),
        verifyMagicLinkToken: mock(async () => ({ userId: 'u-existing' })),
      },
      email: {
        sendMagicLinkEmail: mock(async () => undefined),
      },
      billingSync: {
        syncUserSubscriptionByEmail,
      },
      logger: {
        warn: mock(() => undefined),
      },
    });

    await service.startAuth('user@example.com');

    expect(syncUserSubscriptionByEmail).not.toHaveBeenCalled();
  });

  it('continues auth flow when billing sync fails', async () => {
    const warn = mock(() => undefined);
    const sendMagicLinkEmail = mock(async () => undefined);

    const service = createAuthService({
      userRepository: {
        getOrCreateUserByEmail: mock(async () => ({
          user: { id: 'u-new', email: 'user@example.com', plan: 'free', planStatus: 'inactive' },
          isNew: true,
        })),
        findUserById: mock(async () => null),
      },
      jwt: {
        generateMagicLinkToken: mock(async () => 'magic-token'),
        generateSessionToken: mock(async () => 'session-token'),
        verifyMagicLinkToken: mock(async () => ({ userId: 'u-new' })),
      },
      email: {
        sendMagicLinkEmail,
      },
      billingSync: {
        syncUserSubscriptionByEmail: mock(async () => {
          throw new Error('polar unavailable');
        }),
      },
      logger: {
        warn,
      },
    });

    await service.startAuth('user@example.com');

    expect(sendMagicLinkEmail).toHaveBeenCalledWith('user@example.com', 'magic-token');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

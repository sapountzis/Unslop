import { db as defaultDb } from '../db';
import type { Database } from '../db';
import { runtime, type RuntimeConfig } from '../config/runtime';
import { logger } from '../lib/logger';
import type { AppLogger } from '../lib/logger-types';
import {
  generateMagicLinkToken,
  generateSessionToken,
  verifyMagicLinkToken,
  verifySessionToken,
} from '../lib/jwt';
import { sendMagicLinkEmail } from '../lib/email';
import { createAuthMiddleware } from '../middleware/auth';
import { createUserRepository } from '../repositories/user-repository';
import { createClassificationCacheRepository } from '../repositories/classification-cache-repository';
import { createClassificationEventRepository } from '../repositories/classification-event-repository';
import { createActivityRepository } from '../repositories/activity-repository';
import { createStatsRepository } from '../repositories/stats-repository';
import { createQuotaContextService } from '../services/quota-context';
import { createQuotaService } from '../services/quota';
import { createLlmService } from '../services/llm';
import { createClassificationService } from '../services/classification-service';
import { createPolarService } from '../services/polar';
import { createAuthService } from '../services/auth-service';
import { createFeedbackService } from '../services/feedback-service';
import { createStatsService } from '../services/stats-service';

export interface AppDependencies {
  config: RuntimeConfig;
  db: Database;
  logger: AppLogger;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  services: {
    classification: ReturnType<typeof createClassificationService>;
    auth: ReturnType<typeof createAuthService>;
    feedback: ReturnType<typeof createFeedbackService>;
    stats: ReturnType<typeof createStatsService>;
    polar: ReturnType<typeof createPolarService>;
    quota: ReturnType<typeof createQuotaService>;
    quotaContext: ReturnType<typeof createQuotaContextService>;
    llm: ReturnType<typeof createLlmService>;
  };
}

export interface CreateDependenciesOptions {
  config?: RuntimeConfig;
  db?: Database;
  logger?: AppLogger;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  jwt?: {
    generateMagicLinkToken: typeof generateMagicLinkToken;
    generateSessionToken: typeof generateSessionToken;
    verifyMagicLinkToken: typeof verifyMagicLinkToken;
    verifySessionToken: typeof verifySessionToken;
  };
  email?: {
    sendMagicLinkEmail: typeof sendMagicLinkEmail;
  };
}

export function createDependencies(options: CreateDependenciesOptions = {}): AppDependencies {
  const config = options.config ?? runtime;
  const db = options.db ?? defaultDb;
  const appLogger = options.logger ?? logger;
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;

  const jwt = options.jwt ?? {
    generateMagicLinkToken,
    generateSessionToken,
    verifyMagicLinkToken,
    verifySessionToken,
  };

  const email = options.email ?? {
    sendMagicLinkEmail,
  };

  const userRepository = createUserRepository({ db });
  const classificationCacheRepository = createClassificationCacheRepository({ db });
  const classificationEventRepository = createClassificationEventRepository({ db });
  const activityRepository = createActivityRepository({ db });
  const statsRepository = createStatsRepository({ db });

  const quotaContextService = createQuotaContextService({
    db,
    quotas: config.quotas,
    now,
  });

  const quotaService = createQuotaService({
    db,
    quotaContextService,
  });

  const llmService = createLlmService({
    config: {
      apiKey: config.llm.apiKey,
      textModel: config.llm.textModel,
      vlmModel: config.llm.vlmModel,
      baseUrl: config.llm.baseUrl,
    },
    logger: appLogger,
  });

  const classificationService = createClassificationService({
    llmService,
    quotaService,
    classificationCacheRepository,
    classificationEventRepository,
    activityRepository,
    logger: appLogger,
    batchLlmConcurrency: config.classification.batchConcurrency,
  });

  const polarService = createPolarService({
    db,
    config: {
      apiKey: config.billing.polarApiKey,
      apiBase: config.billing.polarApiBase,
      productId: config.billing.polarProductId,
      appUrl: config.server.appUrl,
    },
    fetchImpl,
    logger: appLogger,
    now,
  });

  const authService = createAuthService({
    userRepository,
    jwt,
    email,
    billingSync: polarService,
    logger: appLogger,
  });

  const feedbackService = createFeedbackService({ db });

  const statsService = createStatsService({
    statsRepository,
    quotaContextService,
    now,
  });

  const authMiddleware = createAuthMiddleware({
    verifySessionToken: jwt.verifySessionToken,
  });

  return {
    config,
    db,
    logger: appLogger,
    authMiddleware,
    services: {
      classification: classificationService,
      auth: authService,
      feedback: feedbackService,
      stats: statsService,
      polar: polarService,
      quota: quotaService,
      quotaContext: quotaContextService,
      llm: llmService,
    },
  };
}

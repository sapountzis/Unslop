import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import type { Database } from '../db';
import { Plan, PlanStatus } from '../lib/billing-constants';

export type UserSummary = {
  id: string;
  email: string;
  plan: string;
  planStatus: string;
};

export interface UserRepository {
  getOrCreateUserByEmail: (normalizedEmail: string) => Promise<UserSummary>;
  findUserById: (userId: string) => Promise<UserSummary | null>;
}

export interface UserRepositoryDeps {
  db: Database;
}

const userSummarySelect = {
  id: users.id,
  email: users.email,
  plan: users.plan,
  planStatus: users.planStatus,
};

function toUserSummary(row: {
  id: string;
  email: string;
  plan: string;
  planStatus: string;
}): UserSummary {
  return {
    id: row.id,
    email: row.email,
    plan: row.plan,
    planStatus: row.planStatus,
  };
}

export function createUserRepository(deps: UserRepositoryDeps): UserRepository {
  const { db } = deps;

  async function getOrCreateUserByEmail(normalizedEmail: string): Promise<UserSummary> {
    const inserted = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        plan: Plan.FREE,
        planStatus: PlanStatus.INACTIVE,
      })
      .onConflictDoNothing({ target: users.email })
      .returning();

    if (inserted.length > 0) {
      return toUserSummary(inserted[0]);
    }

    const existing = await db
      .select(userSummarySelect)
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length === 0) {
      throw new Error('USER_UPSERT_FAILED');
    }

    return toUserSummary(existing[0]);
  }

  async function findUserById(userId: string): Promise<UserSummary | null> {
    const existing = await db
      .select(userSummarySelect)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return existing.length > 0 ? toUserSummary(existing[0]) : null;
  }

  return {
    getOrCreateUserByEmail,
    findUserById,
  };
}

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

export type UserSummary = {
  id: string;
  email: string;
  plan: string;
  planStatus: string;
};

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

export async function getOrCreateUserByEmail(normalizedEmail: string): Promise<UserSummary> {
  const inserted = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      plan: 'free',
      planStatus: 'inactive',
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

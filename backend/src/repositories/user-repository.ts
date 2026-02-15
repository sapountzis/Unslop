import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { Database } from "../db";
import { Plan, PlanStatus } from "../lib/billing-constants";

export type UserSummary = {
	id: string;
	email: string;
	plan: string;
	planStatus: string;
};

export type GetOrCreateUserResult = {
	user: UserSummary;
	isNew: boolean;
};

export interface UserRepository {
	getOrCreateUserByEmail: (
		normalizedEmail: string,
	) => Promise<GetOrCreateUserResult>;
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

	async function getOrCreateUserByEmail(
		normalizedEmail: string,
	): Promise<GetOrCreateUserResult> {
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
			return {
				user: toUserSummary(inserted[0]),
				isNew: true,
			};
		}

		const existing = await db
			.select(userSummarySelect)
			.from(users)
			.where(eq(users.email, normalizedEmail))
			.limit(1);

		if (existing.length === 0) {
			throw new Error("USER_UPSERT_FAILED");
		}

		return {
			user: toUserSummary(existing[0]),
			isNew: false,
		};
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

import { userActivity } from "../db/schema";
import type { Database } from "../db";
import type { Decision } from "../types/classification";

export interface ActivityInsert {
	userId: string;
	postId: string;
	decision: Decision;
	source: "llm" | "cache";
}

export interface ActivityRepository {
	insertActivity: (input: ActivityInsert) => Promise<void>;
}

export interface ActivityRepositoryDeps {
	db: Database;
}

export function createActivityRepository(
	deps: ActivityRepositoryDeps,
): ActivityRepository {
	const { db } = deps;

	async function insertActivity(input: ActivityInsert): Promise<void> {
		await db.insert(userActivity).values(input);
	}

	return {
		insertActivity,
	};
}

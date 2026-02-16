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
	insertMany: (inputs: ActivityInsert[]) => Promise<void>;
}

export interface ActivityRepositoryDeps {
	db: Database;
}

export function createActivityRepository(
	deps: ActivityRepositoryDeps,
): ActivityRepository {
	const { db } = deps;

	async function insertMany(inputs: ActivityInsert[]): Promise<void> {
		if (inputs.length === 0) {
			return;
		}

		await db.insert(userActivity).values(inputs);
	}

	return {
		insertMany,
	};
}

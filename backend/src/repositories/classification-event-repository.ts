import type { Database } from "../db";
import { classificationEvents } from "../db/schema";

export interface AppendClassificationSuccessEventInput {
	contentFingerprint: string;
	postId: string;
	model: string;
	decision: string;
	requestPayload: Record<string, unknown>;
	responsePayload: Record<string, unknown>;
}

export interface ClassificationEventRepository {
	appendMany: (
		inputs: AppendClassificationSuccessEventInput[],
	) => Promise<void>;
}

export interface ClassificationEventRepositoryDeps {
	db: Database;
}

export function createClassificationEventRepository(
	deps: ClassificationEventRepositoryDeps,
): ClassificationEventRepository {
	const { db } = deps;

	async function appendMany(
		inputs: AppendClassificationSuccessEventInput[],
	): Promise<void> {
		if (inputs.length === 0) {
			return;
		}

		await db.insert(classificationEvents).values(
			inputs.map((input) => ({
				contentFingerprint: input.contentFingerprint,
				postId: input.postId,
				model: input.model,
				attemptStatus: "success" as const,
				requestPayload: input.requestPayload,
				responsePayload: input.responsePayload,
			})),
		);
	}

	return {
		appendMany,
	};
}

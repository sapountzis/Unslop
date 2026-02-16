import type { Database } from "../db";
import { classificationEvents } from "../db/schema";

export interface AppendClassificationErrorEventInput {
	contentFingerprint: string;
	postId: string;
	providerHttpStatus?: number;
	providerErrorCode?: string;
	providerErrorType?: string;
	providerErrorMessage?: string;
}

export interface ClassificationEventRepository {
	appendMany: (inputs: AppendClassificationErrorEventInput[]) => Promise<void>;
}

export interface ClassificationEventRepositoryDeps {
	db: Database;
}

export function createClassificationEventRepository(
	deps: ClassificationEventRepositoryDeps,
): ClassificationEventRepository {
	const { db } = deps;

	async function appendMany(
		inputs: AppendClassificationErrorEventInput[],
	): Promise<void> {
		if (inputs.length === 0) {
			return;
		}

		await db.insert(classificationEvents).values(
			inputs.map((input) => {
				const providerErrorMessage =
					input.providerErrorMessage?.trim() || "llm_error:unknown";

				return {
					contentFingerprint: input.contentFingerprint,
					postId: input.postId,
					model: null,
					attemptStatus: "error" as const,
					...(input.providerHttpStatus !== undefined
						? { providerHttpStatus: input.providerHttpStatus }
						: {}),
					...(input.providerErrorCode !== undefined
						? { providerErrorCode: input.providerErrorCode }
						: {}),
					...(input.providerErrorType !== undefined
						? { providerErrorType: input.providerErrorType }
						: {}),
					providerErrorMessage,
					requestPayload: {},
					responsePayload: {
						source: "error",
						...(input.providerHttpStatus !== undefined
							? { provider_http_status: input.providerHttpStatus }
							: {}),
						...(input.providerErrorCode !== undefined
							? { provider_error_code: input.providerErrorCode }
							: {}),
						...(input.providerErrorType !== undefined
							? { provider_error_type: input.providerErrorType }
							: {}),
						provider_error_message: providerErrorMessage,
					},
				};
			}),
		);
	}

	return {
		appendMany,
	};
}

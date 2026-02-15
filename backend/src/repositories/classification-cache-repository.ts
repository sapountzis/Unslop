import { and, eq, gt, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { classificationCache } from "../db/schema";
import type { Decision } from "../types/classification";

type JsonObject = Record<string, unknown>;

export interface ClassificationCacheRow {
	contentFingerprint: string;
	postId: string;
	authorId: string;
	authorName: string | null;
	canonicalContent: JsonObject;
	decision: Decision;
	source: "llm";
	model: string | null;
	scoresJson: JsonObject;
	createdAt: Date;
	updatedAt: Date;
}

export interface UpsertClassificationCacheSuccessInput {
	contentFingerprint: string;
	postId: string;
	authorId: string;
	authorName?: string | null;
	canonicalContent: JsonObject;
	decision: Decision;
	source: "llm";
	model?: string | null;
	scoresJson: JsonObject;
}

export interface ClassificationCacheRepository {
	findFreshByFingerprint: (
		contentFingerprint: string,
		freshnessCutoff: Date,
	) => Promise<ClassificationCacheRow | null>;
	findFreshByFingerprints: (
		contentFingerprints: string[],
		freshnessCutoff: Date,
	) => Promise<Map<string, ClassificationCacheRow>>;
	upsertSuccess: (
		input: UpsertClassificationCacheSuccessInput,
	) => Promise<void>;
}

export interface ClassificationCacheRepositoryDeps {
	db: Database;
}

export function createClassificationCacheRepository(
	deps: ClassificationCacheRepositoryDeps,
): ClassificationCacheRepository {
	const { db } = deps;

	async function findFreshByFingerprint(
		contentFingerprint: string,
		freshnessCutoff: Date,
	): Promise<ClassificationCacheRow | null> {
		const rows = await db
			.select({
				contentFingerprint: classificationCache.contentFingerprint,
				postId: classificationCache.postId,
				authorId: classificationCache.authorId,
				authorName: classificationCache.authorName,
				canonicalContent: classificationCache.canonicalContent,
				decision: classificationCache.decision,
				source: classificationCache.source,
				model: classificationCache.model,
				scoresJson: classificationCache.scoresJson,
				createdAt: classificationCache.createdAt,
				updatedAt: classificationCache.updatedAt,
			})
			.from(classificationCache)
			.where(eq(classificationCache.contentFingerprint, contentFingerprint))
			.limit(1);

		if (rows.length === 0) {
			return null;
		}

		const row = rows[0];
		if (row.createdAt.getTime() <= freshnessCutoff.getTime()) {
			return null;
		}

		return {
			contentFingerprint: row.contentFingerprint,
			postId: row.postId,
			authorId: row.authorId,
			authorName: row.authorName,
			canonicalContent: row.canonicalContent as JsonObject,
			decision: row.decision as Decision,
			source: row.source as "llm",
			model: row.model,
			scoresJson: row.scoresJson as JsonObject,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	async function findFreshByFingerprints(
		contentFingerprints: string[],
		freshnessCutoff: Date,
	): Promise<Map<string, ClassificationCacheRow>> {
		if (contentFingerprints.length === 0) {
			return new Map();
		}

		const rows = await db
			.select({
				contentFingerprint: classificationCache.contentFingerprint,
				postId: classificationCache.postId,
				authorId: classificationCache.authorId,
				authorName: classificationCache.authorName,
				canonicalContent: classificationCache.canonicalContent,
				decision: classificationCache.decision,
				source: classificationCache.source,
				model: classificationCache.model,
				scoresJson: classificationCache.scoresJson,
				createdAt: classificationCache.createdAt,
				updatedAt: classificationCache.updatedAt,
			})
			.from(classificationCache)
			.where(
				and(
					inArray(classificationCache.contentFingerprint, contentFingerprints),
					gt(classificationCache.createdAt, freshnessCutoff),
				),
			);

		return new Map(
			rows
				.filter((row) => row.createdAt.getTime() > freshnessCutoff.getTime())
				.map((row) => [
					row.contentFingerprint,
					{
						contentFingerprint: row.contentFingerprint,
						postId: row.postId,
						authorId: row.authorId,
						authorName: row.authorName,
						canonicalContent: row.canonicalContent as JsonObject,
						decision: row.decision as Decision,
						source: row.source as "llm",
						model: row.model,
						scoresJson: row.scoresJson as JsonObject,
						createdAt: row.createdAt,
						updatedAt: row.updatedAt,
					},
				]),
		);
	}

	async function upsertSuccess(
		input: UpsertClassificationCacheSuccessInput,
	): Promise<void> {
		const now = new Date();

		await db
			.insert(classificationCache)
			.values({
				contentFingerprint: input.contentFingerprint,
				postId: input.postId,
				authorId: input.authorId,
				authorName: input.authorName ?? null,
				canonicalContent: input.canonicalContent,
				decision: input.decision,
				source: input.source,
				model: input.model ?? null,
				scoresJson: input.scoresJson,
			})
			.onConflictDoUpdate({
				target: classificationCache.contentFingerprint,
				set: {
					postId: input.postId,
					authorId: input.authorId,
					authorName: input.authorName ?? null,
					canonicalContent: input.canonicalContent,
					decision: input.decision,
					source: input.source,
					model: input.model ?? null,
					scoresJson: input.scoresJson,
					createdAt: now,
					updatedAt: now,
				},
			});
	}

	return {
		findFreshByFingerprint,
		findFreshByFingerprints,
		upsertSuccess,
	};
}

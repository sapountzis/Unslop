import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { classificationCache } from "../db/schema";
import type { Decision } from "../types/classification";

export interface ClassificationCacheRow {
	contentFingerprint: string;
	decision: Decision;
	createdAt: Date;
	updatedAt: Date;
}

export interface InsertClassificationCacheInput {
	contentFingerprint: string;
	decision: Decision;
}

export interface ClassificationCacheRepository {
	findByFingerprint: (
		contentFingerprint: string,
	) => Promise<ClassificationCacheRow | null>;
	findByFingerprints: (
		contentFingerprints: string[],
	) => Promise<Map<string, ClassificationCacheRow>>;
	insertMany: (inputs: InsertClassificationCacheInput[]) => Promise<void>;
}

export interface ClassificationCacheRepositoryDeps {
	db: Database;
}

export function createClassificationCacheRepository(
	deps: ClassificationCacheRepositoryDeps,
): ClassificationCacheRepository {
	const { db } = deps;

	async function findByFingerprint(
		contentFingerprint: string,
	): Promise<ClassificationCacheRow | null> {
		const rows = await db
			.select({
				contentFingerprint: classificationCache.contentFingerprint,
				decision: classificationCache.decision,
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
		return {
			contentFingerprint: row.contentFingerprint,
			decision: row.decision as Decision,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	async function findByFingerprints(
		contentFingerprints: string[],
	): Promise<Map<string, ClassificationCacheRow>> {
		if (contentFingerprints.length === 0) {
			return new Map();
		}

		const rows = await db
			.select({
				contentFingerprint: classificationCache.contentFingerprint,
				decision: classificationCache.decision,
				createdAt: classificationCache.createdAt,
				updatedAt: classificationCache.updatedAt,
			})
			.from(classificationCache)
			.where(
				inArray(classificationCache.contentFingerprint, contentFingerprints),
			);

		return new Map(
			rows.map((row) => [
				row.contentFingerprint,
				{
					contentFingerprint: row.contentFingerprint,
					decision: row.decision as Decision,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
				},
			]),
		);
	}

	async function insertMany(
		inputs: InsertClassificationCacheInput[],
	): Promise<void> {
		if (inputs.length === 0) {
			return;
		}

		const now = new Date();

		await db
			.insert(classificationCache)
			.values(
				inputs.map((input) => ({
					contentFingerprint: input.contentFingerprint,
					decision: input.decision,
					createdAt: now,
					updatedAt: now,
				})),
			)
			.onConflictDoNothing({
				target: classificationCache.contentFingerprint,
			});
	}

	return {
		findByFingerprint,
		findByFingerprints,
		insertMany,
	};
}

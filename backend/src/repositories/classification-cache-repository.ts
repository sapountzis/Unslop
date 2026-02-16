import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "../db";
import { classificationCache } from "../db/schema";
import type { Decision } from "../types/classification";

export interface ClassificationCacheRow {
	contentFingerprint: string;
	decision: Decision;
	createdAt: Date;
	updatedAt: Date;
}

export interface UpsertClassificationCacheInput {
	contentFingerprint: string;
	decision: Decision;
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
	upsertMany: (inputs: UpsertClassificationCacheInput[]) => Promise<void>;
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
		if (row.createdAt.getTime() <= freshnessCutoff.getTime()) {
			return null;
		}

		return {
			contentFingerprint: row.contentFingerprint,
			decision: row.decision as Decision,
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
				decision: classificationCache.decision,
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
						decision: row.decision as Decision,
						createdAt: row.createdAt,
						updatedAt: row.updatedAt,
					},
				]),
		);
	}

	async function upsertMany(
		inputs: UpsertClassificationCacheInput[],
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
			.onConflictDoUpdate({
				target: classificationCache.contentFingerprint,
				set: {
					decision: sql`excluded.decision`,
					createdAt: now,
					updatedAt: now,
				},
			});
	}

	return {
		findFreshByFingerprint,
		findFreshByFingerprints,
		upsertMany,
	};
}

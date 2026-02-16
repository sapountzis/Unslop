ALTER TABLE "classification_cache" DROP CONSTRAINT IF EXISTS "classification_cache_source_llm_check";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "post_id";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "author_id";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "author_name";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "canonical_content";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "classification_cache" DROP COLUMN "scores_json";--> statement-breakpoint
DROP TYPE IF EXISTS "post_source";

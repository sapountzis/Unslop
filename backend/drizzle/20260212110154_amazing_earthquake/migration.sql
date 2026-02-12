ALTER TABLE "classification_cache" ALTER COLUMN "decision" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "post_feedback" ALTER COLUMN "rendered_decision" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_activity" ALTER COLUMN "decision" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "decision";--> statement-breakpoint
CREATE TYPE "decision" AS ENUM('keep', 'hide');--> statement-breakpoint
ALTER TABLE "classification_cache" ALTER COLUMN "decision" SET DATA TYPE "decision" USING "decision"::"decision";--> statement-breakpoint
ALTER TABLE "post_feedback" ALTER COLUMN "rendered_decision" SET DATA TYPE "decision" USING "rendered_decision"::"decision";--> statement-breakpoint
ALTER TABLE "user_activity" ALTER COLUMN "decision" SET DATA TYPE "decision" USING "decision"::"decision";
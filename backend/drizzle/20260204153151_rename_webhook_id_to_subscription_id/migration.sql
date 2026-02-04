ALTER TABLE "webhook_deliveries" RENAME COLUMN "webhook_id" TO "subscription_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_webhook_id";--> statement-breakpoint
CREATE INDEX "idx_subscription_id" ON "webhook_deliveries" ("subscription_id");

CREATE TABLE "webhook_deliveries" (
	"webhook_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"subscription_id" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_event_type" ON "webhook_deliveries" ("event_type");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_webhook_id" ON "webhook_deliveries" ("webhook_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_subscription_id" ON "webhook_deliveries" ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_processed_at" ON "webhook_deliveries" ("processed_at");

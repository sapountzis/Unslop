CREATE TABLE "webhook_deliveries" (
	"id" bigserial PRIMARY KEY,
	"webhook_id" text NOT NULL UNIQUE,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_webhook_id" ON "webhook_deliveries" ("webhook_id");--> statement-breakpoint
CREATE INDEX "idx_event_type" ON "webhook_deliveries" ("event_type");--> statement-breakpoint
CREATE INDEX "idx_user_id" ON "webhook_deliveries" ("user_id");
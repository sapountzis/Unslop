CREATE TABLE "post_feedback" (
	"id" bigserial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"rendered_decision" text NOT NULL,
	"user_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"post_id" text PRIMARY KEY,
	"author_id" text NOT NULL,
	"author_name" text,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"decision" text NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"id" bigserial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"decision" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" uuid,
	"month_start" date,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_usage_pkey" PRIMARY KEY("user_id","month_start")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_status" text DEFAULT 'inactive' NOT NULL,
	"polar_customer_id" text,
	"polar_subscription_id" text
);
--> statement-breakpoint
CREATE INDEX "idx_feedback_post_id" ON "post_feedback" ("post_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_user_id" ON "post_feedback" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_posts_author_id" ON "posts" ("author_id");--> statement-breakpoint
CREATE INDEX "idx_posts_updated_at" ON "posts" ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_activity_user_id" ON "user_activity" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_created_at" ON "user_activity" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_user_id_created_at" ON "user_activity" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_post_id_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("post_id");--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");
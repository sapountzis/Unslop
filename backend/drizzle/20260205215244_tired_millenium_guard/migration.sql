CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "activity_source" AS ENUM('llm', 'cache');--> statement-breakpoint
CREATE TYPE "decision" AS ENUM('keep', 'dim', 'hide');--> statement-breakpoint
CREATE TYPE "feedback_label" AS ENUM('should_keep', 'should_hide');--> statement-breakpoint
CREATE TYPE "plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "plan_status" AS ENUM('inactive', 'active', 'canceled', 'past_due');--> statement-breakpoint
CREATE TYPE "post_source" AS ENUM('llm', 'cache', 'error');--> statement-breakpoint
CREATE TABLE "post_feedback" (
	"id" bigserial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"rendered_decision" "decision" NOT NULL,
	"user_label" "feedback_label" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"post_id" text PRIMARY KEY,
	"author_id" text NOT NULL,
	"author_name" text,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"decision" "decision" NOT NULL,
	"source" "post_source" NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_content_text_len_check" CHECK (char_length("content_text") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"id" bigserial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"decision" "decision" NOT NULL,
	"source" "activity_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" uuid,
	"month_start" date,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_usage_pkey" PRIMARY KEY("user_id","month_start"),
	CONSTRAINT "user_usage_llm_calls_nonnegative_check" CHECK ("llm_calls" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan" "plan" DEFAULT 'free'::"plan" NOT NULL,
	"plan_status" "plan_status" DEFAULT 'inactive'::"plan_status" NOT NULL,
	"polar_customer_id" text,
	"polar_subscription_id" text,
	"subscription_period_start" timestamp with time zone,
	"subscription_period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"webhook_id" text PRIMARY KEY,
	"event_type" text NOT NULL,
	"subscription_id" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_feedback_post_id" ON "post_feedback" ("post_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_user_id" ON "post_feedback" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_user_id_created_at" ON "user_activity" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_polar_customer_id" ON "users" ("polar_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_polar_subscription_id" ON "users" ("polar_subscription_id");--> statement-breakpoint
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_post_id_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("post_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Database initialization for local development
-- This file is run automatically when the PostgreSQL container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables
CREATE TABLE "users" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    "email" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "plan" text DEFAULT 'free' NOT NULL,
    "plan_status" text DEFAULT 'inactive' NOT NULL,
    "polar_customer_id" text,
    "polar_subscription_id" text,
    CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "posts" (
    "post_id" text PRIMARY KEY NOT NULL,
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

CREATE TABLE "post_feedback" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL,
    "post_id" text NOT NULL,
    "rendered_decision" text NOT NULL,
    "user_label" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user_usage" (
    "user_id" uuid NOT NULL,
    "month_start" date NOT NULL,
    "llm_calls" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "user_usage_user_id_month_start_pk" PRIMARY KEY("user_id","month_start")
);

-- Add foreign keys
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_user_id_users_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "post_feedback" ADD CONSTRAINT "post_feedback_post_id_posts_post_id_fk" 
    FOREIGN KEY ("post_id") REFERENCES "public"."posts"("post_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Create indexes
CREATE INDEX "idx_feedback_post_id" ON "post_feedback" USING btree ("post_id");
CREATE INDEX "idx_feedback_user_id" ON "post_feedback" USING btree ("user_id");
CREATE INDEX "idx_posts_author_id" ON "posts" USING btree ("author_id");
CREATE INDEX "idx_posts_updated_at" ON "posts" USING btree ("updated_at");

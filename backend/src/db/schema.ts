// Database schema for Unslop backend
import {
	pgTable,
	uuid,
	text,
	timestamp,
	date,
	integer,
	bigserial,
	jsonb,
	index,
	primaryKey,
	pgEnum,
	uniqueIndex,
	check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
	DECISION_VALUES,
	FEEDBACK_LABEL_VALUES,
	PLAN_STATUS_VALUES,
	PLAN_VALUES,
} from "../lib/domain-constants";

export const planEnum = pgEnum("plan", PLAN_VALUES);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUS_VALUES);
export const decisionEnum = pgEnum("decision", DECISION_VALUES);
export const postSourceEnum = pgEnum("post_source", ["llm", "cache", "error"]);
export const activitySourceEnum = pgEnum("activity_source", ["llm", "cache"]);
export const feedbackLabelEnum = pgEnum(
	"feedback_label",
	FEEDBACK_LABEL_VALUES,
);
export const classificationAttemptStatusEnum = pgEnum(
	"classification_attempt_status",
	["success", "error"],
);

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		email: text("email").unique().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		// plan & billing
		plan: planEnum("plan").notNull().default("free"),
		planStatus: planStatusEnum("plan_status").notNull().default("inactive"),
		polarCustomerId: text("polar_customer_id"),
		polarSubscriptionId: text("polar_subscription_id"),
		subscriptionPeriodStart: timestamp("subscription_period_start", {
			withTimezone: true,
		}),
		subscriptionPeriodEnd: timestamp("subscription_period_end", {
			withTimezone: true,
		}),
	},
	(table) => [
		uniqueIndex("idx_users_polar_customer_id").on(table.polarCustomerId),
		uniqueIndex("idx_users_polar_subscription_id").on(
			table.polarSubscriptionId,
		),
	],
);

export const classificationCache = pgTable(
	"classification_cache",
	{
		contentFingerprint: text("content_fingerprint").primaryKey(),
		postId: text("post_id").notNull(),
		authorId: text("author_id").notNull(),
		authorName: text("author_name"),
		canonicalContent: jsonb("canonical_content").notNull(),

		decision: decisionEnum("decision").notNull(),
		source: postSourceEnum("source").notNull(),
		model: text("model"),
		scoresJson: jsonb("scores_json").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_classification_cache_created_at").on(table.createdAt),
		index("idx_classification_cache_updated_at").on(table.updatedAt),
		check(
			"classification_cache_source_llm_check",
			sql`${table.source} = 'llm'`,
		),
	],
);

export const classificationEvents = pgTable(
	"classification_events",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		contentFingerprint: text("content_fingerprint").notNull(),
		postId: text("post_id").notNull(),
		model: text("model"),

		attemptStatus: classificationAttemptStatusEnum("attempt_status").notNull(),
		providerHttpStatus: integer("provider_http_status"),
		providerErrorCode: text("provider_error_code"),
		providerErrorType: text("provider_error_type"),
		providerErrorMessage: text("provider_error_message"),

		requestPayload: jsonb("request_payload").notNull(),
		responsePayload: jsonb("response_payload").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_classification_events_fingerprint").on(table.contentFingerprint),
		index("idx_classification_events_post_id").on(table.postId),
		index("idx_classification_events_attempt_status").on(table.attemptStatus),
		index("idx_classification_events_created_at").on(table.createdAt),
		check(
			"classification_events_error_metadata_check",
			sql`${table.attemptStatus} = 'success' OR ${table.providerHttpStatus} IS NOT NULL OR ${table.providerErrorCode} IS NOT NULL OR ${table.providerErrorType} IS NOT NULL OR ${table.providerErrorMessage} IS NOT NULL`,
		),
	],
);

export const postFeedback = pgTable(
	"post_feedback",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		postId: text("post_id").notNull(),

		renderedDecision: decisionEnum("rendered_decision").notNull(),
		userLabel: feedbackLabelEnum("user_label").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_feedback_post_id").on(table.postId),
		index("idx_feedback_user_id").on(table.userId),
	],
);

export const userUsage = pgTable(
	"user_usage",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		monthStart: date("month_start").notNull(), // billing period anchor date in UTC (free: account-created anchor, pro: subscription start)
		llmCalls: integer("llm_calls").notNull().default(0),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.monthStart] }),
		check(
			"user_usage_llm_calls_nonnegative_check",
			sql`${table.llmCalls} >= 0`,
		),
	],
);

// Track individual classification events per user for statistics
export const userActivity = pgTable(
	"user_activity",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		postId: text("post_id").notNull(),
		decision: decisionEnum("decision").notNull(),
		source: activitySourceEnum("source").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_activity_user_id_created_at").on(table.userId, table.createdAt),
	],
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
	webhookId: text("webhook_id").primaryKey(),
	eventType: text("event_type").notNull(),
	subscriptionId: text("subscription_id"),
	processedAt: timestamp("processed_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

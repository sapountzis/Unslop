// Database schema for Unslop backend
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  bigserial,
  index,
  primaryKey,
  pgEnum,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  DECISION_VALUES,
  FEEDBACK_LABEL_VALUES,
  PLAN_STATUS_VALUES,
  PLAN_VALUES,
} from '../lib/domain-constants';

export const planEnum = pgEnum('plan', PLAN_VALUES);
export const planStatusEnum = pgEnum('plan_status', PLAN_STATUS_VALUES);
export const decisionEnum = pgEnum('decision', DECISION_VALUES);
export const postSourceEnum = pgEnum('post_source', ['llm', 'cache', 'error']);
export const activitySourceEnum = pgEnum('activity_source', ['llm', 'cache']);
export const feedbackLabelEnum = pgEnum('feedback_label', FEEDBACK_LABEL_VALUES);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

  // plan & billing
  plan: planEnum('plan').notNull().default('free'),
  planStatus: planStatusEnum('plan_status').notNull().default('inactive'),
  polarCustomerId: text('polar_customer_id'),
  polarSubscriptionId: text('polar_subscription_id'),
  subscriptionPeriodStart: timestamp('subscription_period_start', { withTimezone: true }),
  subscriptionPeriodEnd: timestamp('subscription_period_end', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_users_polar_customer_id').on(table.polarCustomerId),
  uniqueIndex('idx_users_polar_subscription_id').on(table.polarSubscriptionId),
]);

export const posts = pgTable('posts', {
  postId: text('post_id').primaryKey(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name'),

  contentText: text('content_text').notNull(),
  contentHash: text('content_hash').notNull(), // SHA-256 of content_text (hex)

  decision: decisionEnum('decision').notNull(),
  source: postSourceEnum('source').notNull(),
  model: text('model'), // e.g. 'openrouter:gpt-...'; nullable

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('posts_content_text_len_check', sql`char_length(${table.contentText}) <= 4000`),
]);

export const postFeedback = pgTable('post_feedback', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').notNull().references(() => posts.postId, { onDelete: 'cascade' }),

  renderedDecision: decisionEnum('rendered_decision').notNull(),
  userLabel: feedbackLabelEnum('user_label').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feedback_post_id').on(table.postId),
  index('idx_feedback_user_id').on(table.userId),
]);

export const userUsage = pgTable('user_usage', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  monthStart: date('month_start').notNull(), // YYYY-MM-01 in UTC
  llmCalls: integer('llm_calls').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.userId, table.monthStart] }),
  check('user_usage_llm_calls_nonnegative_check', sql`${table.llmCalls} >= 0`),
  check(
    'user_usage_month_start_month_boundary_check',
    sql`date_trunc('month', ${table.monthStart}::timestamp) = ${table.monthStart}::timestamp`
  ),
]);

// Track individual classification events per user for statistics
export const userActivity = pgTable('user_activity', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').notNull(),
  decision: decisionEnum('decision').notNull(),
  source: activitySourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_activity_user_id_created_at').on(table.userId, table.createdAt),
]);

export const webhookDeliveries = pgTable('webhook_deliveries', {
  webhookId: text('webhook_id').primaryKey(),
  eventType: text('event_type').notNull(),
  subscriptionId: text('subscription_id'),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

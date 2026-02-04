// Database schema for Unslop backend
import { pgTable, uuid, text, timestamp, date, integer, bigserial, index, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

  // plan & billing
  plan: text('plan').notNull().default('free'), // 'free' | 'pro'
  planStatus: text('plan_status').notNull().default('inactive'), // 'active' | 'inactive'
  polarCustomerId: text('polar_customer_id'),
  polarSubscriptionId: text('polar_subscription_id'),
  subscriptionPeriodStart: timestamp('subscription_period_start', { withTimezone: true }),
  subscriptionPeriodEnd: timestamp('subscription_period_end', { withTimezone: true }),
});

export const posts = pgTable('posts', {
  postId: text('post_id').primaryKey(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name'),

  contentText: text('content_text').notNull(), // normalized + truncated (<= 4000 chars)
  contentHash: text('content_hash').notNull(), // SHA-256 of content_text (hex)

  decision: text('decision').notNull(), // 'keep' | 'dim' | 'hide'
  source: text('source').notNull(), // 'llm' | 'cache' | 'error'
  model: text('model'), // e.g. 'openrouter:gpt-...'; nullable

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_posts_author_id').on(table.authorId),
  index('idx_posts_updated_at').on(table.updatedAt),
]);

export const postFeedback = pgTable('post_feedback', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  postId: text('post_id').notNull().references(() => posts.postId),

  renderedDecision: text('rendered_decision').notNull(), // 'keep' | 'dim' | 'hide'
  userLabel: text('user_label').notNull(), // 'should_keep' | 'should_hide'

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feedback_post_id').on(table.postId),
  index('idx_feedback_user_id').on(table.userId),
]);

export const userUsage = pgTable('user_usage', {
  userId: uuid('user_id').notNull().references(() => users.id),
  monthStart: date('month_start').notNull(), // YYYY-MM-01 in UTC
  llmCalls: integer('llm_calls').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.userId, table.monthStart] }),
]);

// Track individual classification events per user for statistics
export const userActivity = pgTable('user_activity', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  postId: text('post_id').notNull(),
  decision: text('decision').notNull(), // 'keep' | 'dim' | 'hide'
  source: text('source').notNull(), // 'llm' | 'cache'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_activity_user_id').on(table.userId),
  index('idx_activity_created_at').on(table.createdAt),
  index('idx_activity_user_id_created_at').on(table.userId, table.createdAt),
]);

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  webhookId: text('webhook_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(), // 'success' | 'failed'
  userId: text('user_id'), // May be null for some events
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webhook_id').on(table.webhookId),
  index('idx_event_type').on(table.eventType),
  index('idx_user_id').on(table.userId),
]);

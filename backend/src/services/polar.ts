import { eq } from "drizzle-orm";
import { z } from "zod";
import { users, webhookDeliveries } from "../db/schema";
import type { Database } from "../db";
import { logger as defaultLogger } from "../lib/logger";
import { BillingError, Plan, PlanStatus } from "../lib/billing-constants";
import {
	getSubscriptionIdFromWebhookData,
	mapSubscriptionStatusToAction,
	normalizeSubscriptionData,
} from "./polar-webhook-schema";
import { POLAR_PRICE_CACHE_TTL_MS } from "../lib/policy-constants";
import type { AppLogger } from "../lib/logger-types";

export interface BillingWebhookPayload {
	type: string;
	timestamp: Date | string;
	data: unknown;
}

export interface WebhookDeliveryClaim {
	webhookId: string;
	isDuplicate: boolean;
}

interface ClaimWebhookDeliveryByIdInput {
	webhookId: string;
	eventType: string;
	subscriptionId?: string | null;
}

export interface PolarConfig {
	apiKey: string;
	apiBase: string;
	productId: string;
	appUrl: string;
}

export interface PolarServiceDeps {
	db: Database;
	config: PolarConfig;
	fetchImpl?: typeof fetch;
	logger?: Pick<AppLogger, "info" | "warn">;
	now?: () => Date;
}

export interface PolarService {
	createCheckoutSession: (userId: string) => Promise<{ checkout_url: string }>;
	syncUserSubscriptionByEmail: (input: {
		userId: string;
		email: string;
	}) => Promise<void>;
	buildWebhookDeliveryKey: (payload: BillingWebhookPayload) => string;
	claimWebhookDeliveryById: (
		input: ClaimWebhookDeliveryByIdInput,
	) => Promise<WebhookDeliveryClaim>;
	releaseWebhookDeliveryById: (webhookId: string) => Promise<void>;
	claimWebhookDelivery: (
		payload: BillingWebhookPayload,
	) => Promise<WebhookDeliveryClaim>;
	handleSubscriptionActive: (data: unknown) => Promise<void>;
	handleSubscriptionCanceled: (data: unknown) => Promise<void>;
	handleSubscriptionUncanceled: (data: unknown) => Promise<void>;
	handleSubscriptionRevoked: (data: unknown) => Promise<void>;
	handleSubscriptionPastDue: (data: unknown) => Promise<void>;
	handleSubscriptionUpdated: (data: unknown) => Promise<void>;
}

const polarCustomerListSchema = z
	.object({
		items: z.array(
			z
				.object({
					id: z.string(),
				})
				.passthrough(),
		),
	})
	.passthrough();

const polarCustomerStateSchema = z
	.object({
		id: z.string(),
		active_subscriptions: z.array(
			z
				.object({
					id: z.string(),
					product_id: z.string().optional(),
					status: z.string().optional(),
					current_period_start: z
						.union([z.string(), z.date()])
						.nullable()
						.optional(),
					current_period_end: z
						.union([z.string(), z.date()])
						.nullable()
						.optional(),
				})
				.passthrough(),
		),
	})
	.passthrough();

function asIsoTimestamp(timestamp: Date | string): string {
	const parsed = timestamp instanceof Date ? timestamp : new Date(timestamp);
	return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseOptionalDate(
	value: string | Date | null | undefined,
): Date | undefined {
	if (!value) {
		return undefined;
	}

	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function createPolarService(deps: PolarServiceDeps): PolarService {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const serviceLogger = deps.logger ?? defaultLogger;
	const now = deps.now ?? (() => new Date());

	let cachedPriceId: string | null = null;
	let cachedPriceIdTimestamp = 0;

	async function getPriceId(): Promise<string> {
		if (!deps.config.productId) {
			throw new Error("POLAR_PRODUCT_ID required");
		}

		const nowMs = now().getTime();
		if (
			cachedPriceId &&
			nowMs - cachedPriceIdTimestamp < POLAR_PRICE_CACHE_TTL_MS
		) {
			return cachedPriceId;
		}

		const response = await fetchImpl(
			`${deps.config.apiBase}/v1/products/${deps.config.productId}`,
			{
				headers: { Authorization: `Bearer ${deps.config.apiKey}` },
			},
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch product: ${response.status}`);
		}

		const product = (await response.json()) as {
			prices: Array<{ id: string; type: string; recurring_interval: string }>;
		};

		const price = product.prices.find(
			(entry) =>
				entry.type === "recurring" && entry.recurring_interval === "month",
		);
		if (!price) {
			throw new Error("No monthly recurring price found");
		}

		cachedPriceId = price.id;
		cachedPriceIdTimestamp = nowMs;
		return price.id;
	}

	async function createCheckoutSession(
		userId: string,
	): Promise<{ checkout_url: string }> {
		const [user] = await deps.db
			.select({
				email: users.email,
				plan: users.plan,
				planStatus: users.planStatus,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) throw new Error(BillingError.USER_NOT_FOUND);
		if (user.plan === Plan.PRO && user.planStatus === PlanStatus.ACTIVE) {
			throw new Error(BillingError.ALREADY_PRO);
		}

		const response = await fetchImpl(`${deps.config.apiBase}/v1/checkouts`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${deps.config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				product_price_id: await getPriceId(),
				success_url: `${deps.config.appUrl}/billing/success`,
				cancel_url: `${deps.config.appUrl}/billing/cancel`,
				customer_email: user.email,
				metadata: { user_id: userId },
			}),
		});

		if (!response.ok) {
			throw new Error(`Polar API error: ${response.status}`);
		}

		const data = (await response.json()) as { url: string };
		return { checkout_url: data.url };
	}

	async function syncUserSubscriptionByEmail(input: {
		userId: string;
		email: string;
	}): Promise<void> {
		const customerResponse = await fetchImpl(
			`${deps.config.apiBase}/v1/customers?email=${encodeURIComponent(input.email)}&limit=1`,
			{
				headers: { Authorization: `Bearer ${deps.config.apiKey}` },
			},
		);
		if (!customerResponse.ok) {
			throw new Error(
				`Failed to fetch customer by email: ${customerResponse.status}`,
			);
		}

		const customerPayload = polarCustomerListSchema.safeParse(
			await customerResponse.json(),
		);
		if (!customerPayload.success) {
			throw new Error("Invalid Polar customer list payload");
		}

		const customer = customerPayload.data.items[0];
		if (!customer) {
			return;
		}

		const customerStateResponse = await fetchImpl(
			`${deps.config.apiBase}/v1/customers/${customer.id}/state`,
			{
				headers: { Authorization: `Bearer ${deps.config.apiKey}` },
			},
		);
		if (!customerStateResponse.ok) {
			throw new Error(
				`Failed to fetch customer state: ${customerStateResponse.status}`,
			);
		}

		const customerStatePayload = polarCustomerStateSchema.safeParse(
			await customerStateResponse.json(),
		);
		if (!customerStatePayload.success) {
			throw new Error("Invalid Polar customer state payload");
		}

		const subscription = customerStatePayload.data.active_subscriptions.find(
			(candidate) => candidate.product_id === deps.config.productId,
		);
		if (!subscription) {
			return;
		}

		const subscriptionPeriodStart = parseOptionalDate(
			subscription.current_period_start,
		);
		const subscriptionPeriodEnd = parseOptionalDate(
			subscription.current_period_end,
		);
		const sharedTierState: Partial<{
			polarCustomerId: string;
			polarSubscriptionId: string;
			subscriptionPeriodStart: Date;
			subscriptionPeriodEnd: Date;
		}> = {
			polarCustomerId: customerStatePayload.data.id,
			polarSubscriptionId: subscription.id,
		};
		if (subscriptionPeriodStart) {
			sharedTierState.subscriptionPeriodStart = subscriptionPeriodStart;
		}
		if (subscriptionPeriodEnd) {
			sharedTierState.subscriptionPeriodEnd = subscriptionPeriodEnd;
		}

		switch (mapSubscriptionStatusToAction(subscription.status)) {
			case "activate":
				await setUserTier(
					input.userId,
					Plan.PRO,
					PlanStatus.ACTIVE,
					sharedTierState,
				);
				return;
			case "cancel":
				await setUserTier(
					input.userId,
					Plan.PRO,
					PlanStatus.CANCELED,
					sharedTierState,
				);
				return;
			case "past_due":
				await setUserTier(
					input.userId,
					Plan.PRO,
					PlanStatus.PAST_DUE,
					sharedTierState,
				);
				return;
			case "ignore":
			default:
				return;
		}
	}

	function buildWebhookDeliveryKey(payload: BillingWebhookPayload): string {
		const subscriptionId =
			getSubscriptionIdFromWebhookData(payload.data) ?? "unknown";
		return `${payload.type}:${subscriptionId}:${asIsoTimestamp(payload.timestamp)}`;
	}

	async function claimWebhookDeliveryById(
		input: ClaimWebhookDeliveryByIdInput,
	): Promise<WebhookDeliveryClaim> {
		const subscriptionId = input.subscriptionId || null;

		const inserted = await deps.db
			.insert(webhookDeliveries)
			.values({
				webhookId: input.webhookId,
				eventType: input.eventType,
				subscriptionId: subscriptionId === "unknown" ? null : subscriptionId,
			})
			.onConflictDoNothing({ target: webhookDeliveries.webhookId })
			.returning();

		return {
			webhookId: input.webhookId,
			isDuplicate: inserted.length === 0,
		};
	}

	async function releaseWebhookDeliveryById(webhookId: string): Promise<void> {
		await deps.db
			.delete(webhookDeliveries)
			.where(eq(webhookDeliveries.webhookId, webhookId));
	}

	async function claimWebhookDelivery(
		payload: BillingWebhookPayload,
	): Promise<WebhookDeliveryClaim> {
		const deliveryKey = buildWebhookDeliveryKey(payload);
		return claimWebhookDeliveryById({
			webhookId: deliveryKey,
			eventType: payload.type,
			subscriptionId: getSubscriptionIdFromWebhookData(payload.data),
		});
	}

	async function setUserTier(
		userId: string,
		plan: (typeof Plan)[keyof typeof Plan],
		planStatus: (typeof PlanStatus)[keyof typeof PlanStatus],
		extra: Partial<{
			polarCustomerId: string;
			polarSubscriptionId: string;
			subscriptionPeriodStart: Date;
			subscriptionPeriodEnd: Date;
		}> = {},
	): Promise<void> {
		await deps.db
			.update(users)
			.set({ plan, planStatus, ...extra })
			.where(eq(users.id, userId));
	}

	async function handleSubscriptionActive(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn("billing_webhook_invalid_subscription_active_payload");
			return;
		}

		await setUserTier(sub.userId, Plan.PRO, PlanStatus.ACTIVE, {
			polarCustomerId: sub.customerId,
			polarSubscriptionId: sub.subscriptionId,
			subscriptionPeriodStart: sub.periodStart,
			subscriptionPeriodEnd: sub.periodEnd,
		});

		serviceLogger.info("subscription_active", { userId: sub.userId });
	}

	async function handleSubscriptionCanceled(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn(
				"billing_webhook_invalid_subscription_canceled_payload",
			);
			return;
		}

		await setUserTier(sub.userId, Plan.PRO, PlanStatus.CANCELED, {
			polarSubscriptionId: sub.subscriptionId,
			subscriptionPeriodEnd: sub.periodEnd,
		});

		serviceLogger.info("subscription_canceled", {
			userId: sub.userId,
			accessUntil: sub.periodEnd,
		});
	}

	async function handleSubscriptionUncanceled(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn(
				"billing_webhook_invalid_subscription_uncanceled_payload",
			);
			return;
		}

		await setUserTier(sub.userId, Plan.PRO, PlanStatus.ACTIVE, {
			polarCustomerId: sub.customerId,
			polarSubscriptionId: sub.subscriptionId,
			subscriptionPeriodStart: sub.periodStart,
			subscriptionPeriodEnd: sub.periodEnd,
		});

		serviceLogger.info("subscription_uncanceled", { userId: sub.userId });
	}

	async function handleSubscriptionRevoked(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn(
				"billing_webhook_invalid_subscription_revoked_payload",
			);
			return;
		}

		await setUserTier(sub.userId, Plan.FREE, PlanStatus.INACTIVE, {
			polarSubscriptionId: sub.subscriptionId,
		});

		serviceLogger.info("subscription_revoked", { userId: sub.userId });
	}

	async function handleSubscriptionPastDue(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn(
				"billing_webhook_invalid_subscription_past_due_payload",
			);
			return;
		}

		await setUserTier(sub.userId, Plan.PRO, PlanStatus.PAST_DUE, {
			polarSubscriptionId: sub.subscriptionId,
		});

		serviceLogger.warn("subscription_past_due", { userId: sub.userId });
	}

	async function handleSubscriptionUpdated(data: unknown): Promise<void> {
		const sub = normalizeSubscriptionData(data);
		if (!sub) {
			serviceLogger.warn(
				"billing_webhook_invalid_subscription_updated_payload",
			);
			return;
		}

		switch (mapSubscriptionStatusToAction(sub.status)) {
			case "activate":
				await handleSubscriptionActive(data);
				return;
			case "cancel":
				await handleSubscriptionCanceled(data);
				return;
			case "past_due":
				await handleSubscriptionPastDue(data);
				return;
			case "ignore":
			default:
				return;
		}
	}

	return {
		createCheckoutSession,
		syncUserSubscriptionByEmail,
		buildWebhookDeliveryKey,
		claimWebhookDeliveryById,
		releaseWebhookDeliveryById,
		claimWebhookDelivery,
		handleSubscriptionActive,
		handleSubscriptionCanceled,
		handleSubscriptionUncanceled,
		handleSubscriptionRevoked,
		handleSubscriptionPastDue,
		handleSubscriptionUpdated,
	};
}

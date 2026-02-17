export const DECISION_VALUES = ["keep", "hide"] as const;
export type DecisionValue = (typeof DECISION_VALUES)[number];

export const FEEDBACK_LABEL_VALUES = ["should_keep", "should_hide"] as const;
export type FeedbackLabelValue = (typeof FEEDBACK_LABEL_VALUES)[number];

export const PLAN_VALUES = ["free", "pro"] as const;
export type PlanValue = (typeof PLAN_VALUES)[number];

export const CHECKOUT_PLAN_VALUES = ["pro-monthly"] as const;
export type CheckoutPlanValue = (typeof CHECKOUT_PLAN_VALUES)[number];

export const PLAN_STATUS_VALUES = [
	"inactive",
	"active",
	"canceled",
	"past_due",
] as const;
export type PlanStatusValue = (typeof PLAN_STATUS_VALUES)[number];

export const POLAR_SUBSCRIPTION_STATUS_VALUES = [
	"incomplete",
	"incomplete_expired",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
] as const;
export type PolarSubscriptionStatusValue =
	(typeof POLAR_SUBSCRIPTION_STATUS_VALUES)[number];

export const POLAR_SUBSCRIPTION_EVENT_TYPES = [
	"subscription.created",
	"subscription.active",
	"subscription.updated",
	"subscription.uncanceled",
	"subscription.canceled",
	"subscription.revoked",
	"subscription.past_due",
] as const;
export type PolarSubscriptionEventType =
	(typeof POLAR_SUBSCRIPTION_EVENT_TYPES)[number];

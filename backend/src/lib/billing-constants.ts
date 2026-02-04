// Billing constants

export const Plan = {
    FREE: 'free',
    PRO: 'pro',
} as const;

export const PlanStatus = {
    ACTIVE: 'active',
    CANCELED: 'canceled',
    PAST_DUE: 'past_due',
    INACTIVE: 'inactive',
} as const;

export const PolarStatus = {
    INCOMPLETE: 'incomplete',
    INCOMPLETE_EXPIRED: 'incomplete_expired',
    TRIALING: 'trialing',
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
    UNPAID: 'unpaid',
} as const;

export const BillingError = {
    ALREADY_PRO: 'ALREADY_PRO',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

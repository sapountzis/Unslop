import { describe, expect, it } from 'bun:test';
import {
  getSubscriptionIdFromWebhookData,
  mapSubscriptionStatusToAction,
  normalizeSubscriptionData,
} from './polar-webhook-schema';

describe('polar webhook schema normalization', () => {
  it('parses valid subscription payload shape', () => {
    const result = normalizeSubscriptionData({
      id: 'sub_123',
      customer_id: 'cust_123',
      status: 'active',
      current_period_start: '2026-02-01T00:00:00.000Z',
      current_period_end: '2026-03-01T00:00:00.000Z',
      metadata: { user_id: 'user_123' },
    });

    expect(result).not.toBeNull();
    expect(result?.subscriptionId).toBe('sub_123');
    expect(result?.userId).toBe('user_123');
    expect(result?.status).toBe('active');
  });

  it('returns null when metadata.user_id is missing', () => {
    const result = normalizeSubscriptionData({
      id: 'sub_123',
      metadata: {},
    });

    expect(result).toBeNull();
  });

  it('returns null when subscription id is missing', () => {
    const result = normalizeSubscriptionData({
      metadata: { user_id: 'user_123' },
    });

    expect(result).toBeNull();
    expect(getSubscriptionIdFromWebhookData({ metadata: { user_id: 'user_123' } })).toBeNull();
  });

  it('maps status branches for update handling', () => {
    expect(mapSubscriptionStatusToAction('active')).toBe('activate');
    expect(mapSubscriptionStatusToAction('trialing')).toBe('activate');
    expect(mapSubscriptionStatusToAction('canceled')).toBe('cancel');
    expect(mapSubscriptionStatusToAction('past_due')).toBe('past_due');
    expect(mapSubscriptionStatusToAction('unpaid')).toBe('past_due');
    expect(mapSubscriptionStatusToAction('incomplete')).toBe('ignore');
  });
});

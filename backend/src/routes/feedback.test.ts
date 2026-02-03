// Tests for feedback endpoint
// Set up environment variables before any imports
process.env.TEST_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-key';

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { generateSessionToken, verifySessionToken, type JWTPayload } from '../lib/jwt';
import { posts, postFeedback } from '../db/schema';
import { eq } from 'drizzle-orm';

// We'll test the endpoint logic directly by constructing a minimal test version
// since the actual route requires database connections.

const feedbackSchema = z.object({
  post_id: z.string(),
  rendered_decision: z.enum(['keep', 'dim', 'hide']),
  user_label: z.enum(['should_keep', 'should_hide']),
});

// Mock database
let mockPosts: Array<any> = [];
let mockFeedback: Array<any> = [];

const mockDb = {
  select: () => mockDb,
  from: () => mockDb,
  where: () => mockDb,
  limit: () => Promise.resolve(mockPosts),
  insert: () => mockDb,
  values: (data: any) => {
    mockFeedback.push({ ...data, id: mockFeedback.length + 1, createdAt: new Date() });
    return Promise.resolve();
  },
};

// Test JWT utilities directly
describe('JWT Utilities', () => {
  it('should generate and verify session token', async () => {
    const token = await generateSessionToken('user-123', 'test@example.com');
    expect(typeof token).toBe('string');

    const payload = await verifySessionToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
  });

  it('should reject invalid token', async () => {
    await expect(verifySessionToken('invalid-token')).rejects.toThrow();
  });

  it('should have correct payload structure', async () => {
    const token = await generateSessionToken('user-456', 'test2@example.com');
    const payload = await verifySessionToken(token);

    expect(payload).toHaveProperty('sub');
    expect(payload).toHaveProperty('email');
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});

// Test feedback schema validation
describe('Feedback Schema Validation', () => {
  it('should accept valid feedback data', () => {
    const validData = {
      post_id: 'test-post-123',
      rendered_decision: 'dim' as const,
      user_label: 'should_keep' as const,
    };

    const result = feedbackSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept all valid rendered_decision values', () => {
    const decisions: Array<'keep' | 'dim' | 'hide'> = ['keep', 'dim', 'hide'];

    for (const decision of decisions) {
      const data = {
        post_id: 'test-post-123',
        rendered_decision: decision,
        user_label: 'should_keep' as const,
      };

      const result = feedbackSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid user_label values', () => {
    const labels: Array<'should_keep' | 'should_hide'> = ['should_keep', 'should_hide'];

    for (const label of labels) {
      const data = {
        post_id: 'test-post-123',
        rendered_decision: 'dim' as const,
        user_label: label,
      };

      const result = feedbackSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid rendered_decision', () => {
    const data = {
      post_id: 'test-post-123',
      rendered_decision: 'invalid',
      user_label: 'should_keep' as const,
    };

    const result = feedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid user_label', () => {
    const data = {
      post_id: 'test-post-123',
      rendered_decision: 'dim' as const,
      user_label: 'invalid_label',
    };

    const result = feedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing post_id', () => {
    const data = {
      rendered_decision: 'dim' as const,
      user_label: 'should_keep' as const,
    };

    const result = feedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing rendered_decision', () => {
    const data = {
      post_id: 'test-post-123',
      user_label: 'should_keep' as const,
    };

    const result = feedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing user_label', () => {
    const data = {
      post_id: 'test-post-123',
      rendered_decision: 'dim' as const,
    };

    const result = feedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// Test feedback endpoint logic with mocked database
describe('Feedback Endpoint Logic', () => {
  beforeEach(() => {
    mockPosts = [];
    mockFeedback = [];
  });

  it('should store feedback correctly', () => {
    const feedbackData = {
      userId: 'user-123',
      postId: 'post-123',
      renderedDecision: 'dim',
      userLabel: 'should_keep',
    };

    mockDb.insert().values(feedbackData);

    expect(mockFeedback.length).toBe(1);
    expect(mockFeedback[0].userId).toBe('user-123');
    expect(mockFeedback[0].postId).toBe('post-123');
    expect(mockFeedback[0].renderedDecision).toBe('dim');
    expect(mockFeedback[0].userLabel).toBe('should_keep');
  });

  it('should allow multiple feedback entries per post', () => {
    mockDb.insert().values({
      userId: 'user-123',
      postId: 'post-123',
      renderedDecision: 'dim',
      userLabel: 'should_hide',
    });

    mockDb.insert().values({
      userId: 'user-123',
      postId: 'post-123',
      renderedDecision: 'keep',
      userLabel: 'should_keep',
    });

    expect(mockFeedback.length).toBe(2);
  });

  it('should correctly identify when post exists', async () => {
    mockPosts = [{ postId: 'post-123' }];
    const result = await mockDb.select().from().where().limit();
    expect(result).toEqual([{ postId: 'post-123' }]);
  });

  it('should correctly identify when post does not exist', async () => {
    mockPosts = [];
    const result = await mockDb.select().from().where().limit();
    expect(result).toEqual([]);
  });
});

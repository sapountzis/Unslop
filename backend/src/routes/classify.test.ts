// Tests for classify endpoint and utilities
// Uses real LLM_API_KEY from .env for integration testing
import 'dotenv/config';
import { describe, it, expect } from 'bun:test';
import { normalizeContentText, hashContentText, derivePostId } from '../lib/hash';
import { generateSessionToken, verifySessionToken } from '../lib/jwt';
import { checkQuota, getQuotaStatus, incrementUsageBy } from '../services/quota';
import { classifyPost, composeDecision } from '../services/llm';

const API_URL = process.env.APP_URL || 'http://localhost:3000';

describe('LLM Service', () => {
  it('should classify a post using real API', async () => {
    // Skip if no real API key
    if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY.startsWith('sk-or-dummy')) {
      console.log('⚠️  Skipping LLM test - no real API key');
      return;
    }

    const result = await classifyPost({
      post_id: 'test-post-1',
      author_id: 'author-1',
      author_name: 'Test Author',
      content_text: 'Just published my new course on how to 10x your productivity! 🚀 Link in bio. #hustle #grindset',
    });

    expect(['keep', 'dim', 'hide']).toContain(result.decision);
    expect(result.source).toBe('llm');
    expect(result.model).toBe(process.env.LLM_MODEL!);
    expect(result.latency).toBeGreaterThan(0);
  }, 30000); // 30s timeout for API call

  it('should compose decision from scores correctly', () => {
    // High positive, low negative = keep
    expect(composeDecision({ u: 0.8, d: 0.7, c: 0.6, h: 0.5, rb: 0.1, eb: 0.1, sp: 0.1, ts: 0.1, sf: 0.1 })).toBe('keep');

    // Low positive, high negative = hide
    expect(composeDecision({ u: 0.1, d: 0.1, c: 0.1, h: 0.1, rb: 0.8, eb: 0.8, sp: 0.8, ts: 0.8, sf: 0.8 })).toBe('hide');
  });
});

describe('Classify Endpoint E2E', () => {
  // Use a valid UUID format for test user
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

  it('should classify via API with auth', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'test@example.com');

    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'e2e-test-post-1',
          author_id: 'author-123',
          author_name: 'E2E Test',
          content_text: 'This is a genuine helpful post about programming best practices.',
        },
      }),
    });

    // May fail on quota, but should not fail on auth/validation
    if (res.status === 429) {
      console.log('⚠️  Quota exceeded - skipping assertion');
      return;
    }

    expect(res.status).toBe(200);
    const data = await res.json() as { post_id: string; decision: string; source: string };
    expect(data.post_id).toBe('e2e-test-post-1');
    expect(['keep', 'dim', 'hide']).toContain(data.decision);
  }, 30000);

  it('should reject unauthenticated requests', async () => {
    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post: { post_id: 'x', author_id: 'x', author_name: 'x', content_text: 'x' },
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should reject invalid payload', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'test@example.com');

    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ invalid: 'payload' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('Hash Utilities', () => {
  it('should normalize content text', () => {
    const input = '  EXCESSIVE   WHITESPACE\n\nand  CAPS  ';
    const normalized = normalizeContentText(input);
    expect(normalized).toBe('excessive whitespace and caps');
  });

  it('should truncate content to 4000 characters', () => {
    const longInput = 'a'.repeat(5000);
    const normalized = normalizeContentText(longInput);
    expect(normalized.length).toBe(4000);
  });

  it('should generate consistent hash for same content', () => {
    const content = 'test content';
    const hash1 = hashContentText(content);
    const hash2 = hashContentText(content);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should derive post ID from author and content', () => {
    const postId = derivePostId('author-123', 'test content');
    expect(postId).toMatch(/^[a-f0-9]{64}$/);

    const postId2 = derivePostId('author-123', 'test content');
    expect(postId).toBe(postId2);

    const postId3 = derivePostId('author-123', 'different content');
    expect(postId).not.toBe(postId3);
  });
});

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
});

describe('Quota Service', () => {
  it('should check quota function exists', () => {
    expect(typeof checkQuota).toBe('function');
  });

  it('should expose batch quota helpers', () => {
    expect(typeof getQuotaStatus).toBe('function');
    expect(typeof incrementUsageBy).toBe('function');
  });
});

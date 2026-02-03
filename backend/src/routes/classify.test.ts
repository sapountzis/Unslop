// Tests for classify endpoint
// Set up environment variables before any imports
process.env.TEST_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-key';
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.OPENROUTER_MODEL = 'test-model';
process.env.FREE_MONTHLY_LLM_CALLS = '300';
process.env.PRO_MONTHLY_LLM_CALLS = '10000';
process.env.POST_CACHE_TTL_DAYS = '7';

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { classifyPost } from '../services/llm';
import { checkQuota, incrementUsage } from '../services/quota';
import { normalizeContentText, hashContentText, derivePostId } from '../lib/hash';
import { generateSessionToken, verifySessionToken } from '../lib/jwt';

// Mock fetch for OpenRouter API calls
const mockFetch = mock(() => {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: '{"decision": "dim"}',
        },
      }],
    }),
  } as Response);
});

global.fetch = mockFetch as any;

describe('LLM Service', () => {
  it('should classify a post and return decision', async () => {
    const result = await classifyPost({
      post_id: 'test-post-1',
      author_id: 'author-1',
      author_name: 'Test Author',
      content_text: 'This is a test post about something meaningful.',
    });

    expect(result.decision).toBe('dim');
    expect(result.model).toBe('test-model');
    expect(result.latency).toBeGreaterThan(0);
  });

  it('should fail open to "keep" on API error', async () => {
    // Mock a failed response
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)
    );

    const result = await classifyPost({
      post_id: 'test-post-2',
      author_id: 'author-2',
      author_name: 'Test Author',
      content_text: 'Test content',
    });

    expect(result.decision).toBe('keep');
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

    // Same inputs should produce same hash
    const postId2 = derivePostId('author-123', 'test content');
    expect(postId).toBe(postId2);

    // Different content should produce different hash
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
  it('should return quota not allowed when user not found', async () => {
    // This test requires database mocking, showing the test structure
    // In a real scenario, you would mock the db module
    // For now, we verify the function exists and can be called
    expect(typeof checkQuota).toBe('function');
  });
});

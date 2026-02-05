import { describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { normalizeContentText, hashContentText, derivePostId } from '../lib/hash';
import { generateSessionToken, verifySessionToken } from '../lib/jwt';
import { ScoringEngine } from '../services/scoring';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

mock.module('../db', () => ({
  db: {},
}));

const { classify } = await import('./classify');

const app = createTestApp((testApp) => {
  testApp.route('/', classify);
});

describe('Classify Routes (unit)', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

  it('POST /v1/classify rejects unauthenticated requests', async () => {
    const res = await app.request('http://localhost/v1/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post: {
          post_id: 'x',
          author_id: 'x',
          author_name: 'x',
          content_text: 'x',
        },
      }),
    });

    expect(res.status).toBe(401);
  });

  it('POST /v1/classify rejects invalid payload', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'test@example.com');

    const res = await app.request('http://localhost/v1/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invalid: 'payload' }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /v1/classify/batch rejects unauthenticated batch requests', async () => {
    const res = await app.request('http://localhost/v1/classify/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [] }),
    });

    expect(res.status).toBe(401);
  });

  it('POST /v1/classify/batch rejects invalid batch payload', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'test@example.com');

    const res = await app.request('http://localhost/v1/classify/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invalid: 'payload' }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /v1/classify/batch enforces max batch size', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'test@example.com');
    const posts = Array.from({ length: 21 }, (_, index) => ({
      post_id: `batch-max-${index}`,
      author_id: 'author-123',
      author_name: 'Batch Test',
      content_text: 'Short test content.',
    }));

    const res = await app.request('http://localhost/v1/classify/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ posts }),
    });

    expect(res.status).toBe(400);
  });
});

describe('Scoring Engine', () => {
  const uniform = (value: number, slop: number) => ({
    u: value,
    d: value,
    c: value,
    h: value,
    rb: slop,
    eb: slop,
    sp: slop,
    ts: slop,
    sf: slop,
    x: slop,
  });

  it('scores keep for strong value and weak slop', () => {
    const engine = new ScoringEngine();
    const result = engine.score(uniform(0.7, 0.5)); // ladder = 0.6

    expect(result.decision).toBe('keep');
  });

  it('scores dim for ladder values in [0.4, 0.6)', () => {
    const engine = new ScoringEngine();
    const atLowerBound = engine.score(uniform(0.5, 0.7)); // ladder = 0.4
    const middle = engine.score(uniform(0.4, 0.4)); // ladder = 0.5
    const nearUpperBound = engine.score(uniform(0.69, 0.51)); // ladder = 0.59

    expect(atLowerBound.decision).toBe('dim');
    expect(middle.decision).toBe('dim');
    expect(nearUpperBound.decision).toBe('dim');
  });

  it('scores hide for weak value and strong slop', () => {
    const engine = new ScoringEngine();
    const result = engine.score(uniform(0.49, 0.71)); // ladder = 0.39

    expect(result.decision).toBe('hide');
  });

  it('regression: at least one input produces dim', () => {
    const engine = new ScoringEngine();
    const result = engine.score(uniform(0.4, 0.4));

    expect(result.decision).toBe('dim');
  });
});

describe('Hash Utilities', () => {
  it('normalizes content text', () => {
    const input = '  EXCESSIVE   WHITESPACE\n\nand  CAPS  ';
    const normalized = normalizeContentText(input);
    expect(normalized).toBe('excessive whitespace and caps');
  });

  it('truncates content to 4000 characters', () => {
    const longInput = 'a'.repeat(5000);
    const normalized = normalizeContentText(longInput);
    expect(normalized.length).toBe(4000);
  });

  it('generates consistent hash for same content', () => {
    const content = 'test content';
    const hash1 = hashContentText(content);
    const hash2 = hashContentText(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives post ID from author and content', () => {
    const postId = derivePostId('author-123', 'test content');
    const postId2 = derivePostId('author-123', 'test content');
    const postId3 = derivePostId('author-123', 'different content');

    expect(postId).toMatch(/^[a-f0-9]{64}$/);
    expect(postId).toBe(postId2);
    expect(postId).not.toBe(postId3);
  });
});

describe('JWT Utilities', () => {
  it('generates and verifies session token', async () => {
    const token = await generateSessionToken('user-123', 'test@example.com');
    const payload = await verifySessionToken(token);

    expect(typeof token).toBe('string');
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
  });

  it('rejects invalid token', async () => {
    await expect(verifySessionToken('invalid-token')).rejects.toThrow();
  });
});

import { describe, expect, it, mock } from 'bun:test';
import type { Database } from '../db';
import { createClassificationCacheRepository } from './classification-cache-repository';

const DAY_MS = 24 * 60 * 60 * 1000;

function createSingleSelectDbMock(rows: Array<Record<string, unknown>>) {
  const limit = mock(async () => rows);
  const where = mock(() => ({ limit }));
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));

  return {
    db: { select } as unknown as Database,
    spies: { select, from, where, limit },
  };
}

function createBulkSelectDbMock(rows: Array<Record<string, unknown>>) {
  const where = mock(async () => rows);
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));

  return {
    db: { select } as unknown as Database,
    spies: { select, from, where },
  };
}

function createInsertDbMock() {
  const onConflictDoUpdate = mock(async () => undefined);
  const values = mock(() => ({ onConflictDoUpdate }));
  const insert = mock(() => ({ values }));

  return {
    db: { insert } as unknown as Database,
    spies: { insert, values, onConflictDoUpdate },
  };
}

function createInsertDbConstraintMock() {
  const onConflictDoUpdate = mock(async () => undefined);
  const values = mock((value: { source: string }) => {
    if (value.source !== 'llm') {
      throw new Error('violates check constraint "classification_cache_source_llm_check"');
    }

    return { onConflictDoUpdate };
  });
  const insert = mock(() => ({ values }));

  return {
    db: { insert } as unknown as Database,
  };
}

describe('classification cache repository', () => {
  it('findFreshByFingerprint respects 30-day freshness', async () => {
    const now = new Date('2026-02-09T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const rowCreatedAt = new Date(now.getTime() - 29 * DAY_MS);

    const { db, spies } = createSingleSelectDbMock([
      {
        contentFingerprint: 'fp-1',
        postId: 'post-1',
        authorId: 'author-1',
        authorName: 'Author One',
        canonicalContent: { text: 'hello' },
        decision: 'hide',
        source: 'llm',
        model: 'openrouter/mock',
        scoresJson: { u: 0.1 },
        createdAt: rowCreatedAt,
        updatedAt: rowCreatedAt,
      },
    ]);

    const repository = createClassificationCacheRepository({ db });
    const result = await repository.findFreshByFingerprint('fp-1', cutoff);

    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        contentFingerprint: 'fp-1',
        postId: 'post-1',
        decision: 'hide',
        source: 'llm',
      }),
    );
    expect(spies.select).toHaveBeenCalledTimes(1);
    expect(spies.limit).toHaveBeenCalledWith(1);
  });

  it('stale cache misses after 31 days', async () => {
    const now = new Date('2026-02-09T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const rowCreatedAt = new Date(now.getTime() - 31 * DAY_MS);

    const { db } = createSingleSelectDbMock([
      {
        contentFingerprint: 'fp-2',
        postId: 'post-2',
        authorId: 'author-2',
        authorName: 'Author Two',
        canonicalContent: { text: 'stale' },
        decision: 'keep',
        source: 'llm',
        model: 'openrouter/mock',
        scoresJson: { u: 0.1 },
        createdAt: rowCreatedAt,
        updatedAt: rowCreatedAt,
      },
    ]);

    const repository = createClassificationCacheRepository({ db });
    const result = await repository.findFreshByFingerprint('fp-2', cutoff);

    expect(result).toBeNull();
  });

  it('findFreshByFingerprints returns fresh hits keyed by fingerprint', async () => {
    const now = new Date('2026-02-09T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const freshCreatedAt = new Date(now.getTime() - 10 * DAY_MS);
    const staleCreatedAt = new Date(now.getTime() - 35 * DAY_MS);

    const { db, spies } = createBulkSelectDbMock([
      {
        contentFingerprint: 'fp-fresh-1',
        postId: 'post-fresh-1',
        authorId: 'author-1',
        authorName: 'Author One',
        canonicalContent: { text: 'fresh 1' },
        decision: 'keep',
        source: 'llm',
        model: 'openrouter/mock',
        scoresJson: { u: 0.1 },
        createdAt: freshCreatedAt,
        updatedAt: freshCreatedAt,
      },
      {
        contentFingerprint: 'fp-stale',
        postId: 'post-stale',
        authorId: 'author-2',
        authorName: 'Author Two',
        canonicalContent: { text: 'stale' },
        decision: 'hide',
        source: 'llm',
        model: 'openrouter/mock',
        scoresJson: { u: 0.2 },
        createdAt: staleCreatedAt,
        updatedAt: staleCreatedAt,
      },
      {
        contentFingerprint: 'fp-fresh-2',
        postId: 'post-fresh-2',
        authorId: 'author-3',
        authorName: 'Author Three',
        canonicalContent: { text: 'fresh 2' },
        decision: 'hide',
        source: 'llm',
        model: 'openrouter/mock',
        scoresJson: { u: 0.3 },
        createdAt: freshCreatedAt,
        updatedAt: freshCreatedAt,
      },
    ]);

    const repository = createClassificationCacheRepository({ db });
    const result = await repository.findFreshByFingerprints(
      ['fp-fresh-1', 'fp-stale', 'fp-fresh-2'],
      cutoff,
    );

    expect(spies.select).toHaveBeenCalledTimes(1);
    expect(spies.where).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(2);
    expect(result.get('fp-fresh-1')).toEqual(
      expect.objectContaining({
        postId: 'post-fresh-1',
        source: 'llm',
      }),
    );
    expect(result.get('fp-stale')).toBeUndefined();
    expect(result.get('fp-fresh-2')).toEqual(
      expect.objectContaining({
        postId: 'post-fresh-2',
        source: 'llm',
      }),
    );
  });

  it('findFreshByFingerprints handles empty input without querying', async () => {
    const select = mock(() => {
      throw new Error('select should not be called');
    });
    const db = { select } as unknown as Database;
    const repository = createClassificationCacheRepository({ db });

    const result = await repository.findFreshByFingerprints([], new Date());

    expect(result.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  it('allows same post_id across different fingerprints via fingerprint conflict target', async () => {
    const { db, spies } = createInsertDbMock();
    const repository = createClassificationCacheRepository({ db });

    const basePayload = {
      postId: 'shared-post-id',
      authorId: 'author-1',
      authorName: 'Author One',
      canonicalContent: { text: 'hello' },
      decision: 'keep' as const,
      source: 'llm' as const,
      model: 'openrouter/mock',
      scoresJson: { u: 0.1 },
    };

    await repository.upsertSuccess({
      ...basePayload,
      contentFingerprint: 'fp-1',
    });
    await repository.upsertSuccess({
      ...basePayload,
      contentFingerprint: 'fp-2',
    });

    expect(spies.insert).toHaveBeenCalledTimes(2);
    expect(spies.onConflictDoUpdate).toHaveBeenCalledTimes(2);
  });

  it('surfaces check-constraint violations for invalid cache source values', async () => {
    const { db } = createInsertDbConstraintMock();
    const repository = createClassificationCacheRepository({ db });

    await expect(
      repository.upsertSuccess({
        contentFingerprint: 'fp-invalid',
        postId: 'post-invalid',
        authorId: 'author-invalid',
        authorName: 'Author Invalid',
        canonicalContent: { text: 'invalid' },
        decision: 'keep',
        source: 'cache' as never,
        model: 'openrouter/mock',
        scoresJson: { u: 0.1 },
      }),
    ).rejects.toThrow('classification_cache_source_llm_check');
  });
});

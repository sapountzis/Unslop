import { describe, expect, it } from 'bun:test';
import { createLlmService } from './llm';
import { ScoringEngine } from './scoring';
import { runtime } from '../config/runtime';
import { logger } from '../lib/logger';

async function skipIfNoRealLlmKey(): Promise<boolean> {
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY.startsWith('sk-or-dummy')) {
    console.log('Skipping llm integration test: no real LLM_API_KEY is configured.');
    return true;
  }
  if (!process.env.LLM_MODEL) {
    console.log('Skipping llm integration test: LLM_MODEL is not configured.');
    return true;
  }
  return false;
}

describe('LLM Service (integration)', () => {
  it('classifies a post using the configured provider', async () => {
    if (await skipIfNoRealLlmKey()) return;

    const llmService = createLlmService({
      config: {
        apiKey: runtime.llm.apiKey,
        model: runtime.llm.model,
        baseUrl: runtime.llm.baseUrl,
      },
      logger,
    });

    const result = await llmService.classifyPost({
      post_id: 'test-post-1',
      author_id: 'author-1',
      author_name: 'Test Author',
      content_text:
        'Just published my new course on how to 10x your productivity! Link in bio. #hustle #grindset',
    });

    expect(result.source).toBe('llm');
    expect(result.model).toBe(process.env.LLM_MODEL!);
    expect(result.latency).toBeGreaterThan(0);
    expect(result.scores).not.toBeNull();

    const engine = new ScoringEngine();
    const scored = engine.score(result.scores);
    expect(['keep', 'dim', 'hide']).toContain(scored.decision);
  }, 30000);
});

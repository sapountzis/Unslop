// LLM classification service using OpenRouter and OpenAI SDK
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import retry from 'async-retry';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts';
import { ScoreResult } from '../types/classification';
import { logger } from '../lib/logger';

export interface PostInput {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface LLMCallResult {
  scores: ScoreResult | null;
  source: 'llm' | 'error';
  model: string;
  latency: number;
}


// Define the schema using Zod - only abbreviated scores
const DecisionSchema = z.object({
  u: z.number(),
  d: z.number(),
  c: z.number(),
  h: z.number(),
  rb: z.number(),
  eb: z.number(),
  sp: z.number(),
  ts: z.number(),
  sf: z.number(),
  x: z.number(),
});


function getOpenRouterConfig(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiKey) {
    throw new Error('LLM_API_KEY environment variable is required');
  }
  if (!model) {
    throw new Error('LLM_MODEL environment variable is required');
  }

  return {
    apiKey,
    baseUrl: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model,
  };
}

function constructUserPrompt(post: PostInput): string {
  // We prepend author info to the content to provide context, 
  // as the prompt placeholder {{POST_TEXT}} implies just the text, 
  // but author info is valuable for "ego_bait" assessment.
  const contentWithContext = `Author: ${post.author_name}\n\n${post.content_text}`;
  return USER_PROMPT.replace('{{POST_TEXT}}', contentWithContext);
}

/**
 * Executes the LLM call with retry logic for transient failures
 */
async function callLLMWithRetry(openai: OpenAI, model: string, messages: any[]) {
  return await retry(
    async (bail) => {
      try {
        const completion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 1000,
          response_format: zodResponseFormat(DecisionSchema, 'classification'),
        });

        const message = completion.choices[0].message;

        if (message.refusal) {
          // If the model refuses, do not retry
          bail(new Error(`LLM Refusal: ${message.refusal}`));
          return completion; // TypeScript requires return even after bail
        }

        if (!message.content) {
          throw new Error('Empty response from LLM (content is null)');
        }

        return completion;
      } catch (error: any) {
        // Stop retrying on 401/403 errors (auth issues)
        if (error.status === 401 || error.status === 403) {
          bail(error);
          return null as any;
        }
        throw error; // Retry other errors
      }
    },
    {
      retries: 3,
      minTimeout: 2000,
      maxTimeout: 20000,
      randomize: true, // Jitter
      onRetry: (err: any, attempt) => {
        logger.warn('llm_retry', {
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );
}

function parseAndValidateResponse(content: string | null): ScoreResult {
  if (!content) {
    throw new Error('Empty content received from LLM');
  }

  const parsed = JSON.parse(content);
  // Validate with Zod
  return DecisionSchema.parse(parsed);
}

export async function classifyPost(post: PostInput): Promise<LLMCallResult> {
  const startTime = Date.now();

  // Fail fast if no API key (for local dev without key)
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY.startsWith('sk-or-dummy')) {
    logger.warn('llm_dev_fallback', {
      reason: 'missing_or_dummy_api_key',
    });
    return {
      scores: null,
      source: 'error',
      model: 'dev-fallback',
      latency: 0,
    };
  }

  const { apiKey, baseUrl, model } = getOpenRouterConfig();

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  const userPrompt = constructUserPrompt(post);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  try {
    const completion = await callLLMWithRetry(openai, model, messages);
    const scores = parseAndValidateResponse(completion.choices[0].message.content);
    const latency = Date.now() - startTime;

    return {
      scores,
      source: 'llm',
      model: model,
      latency,
    };
  } catch (err) {
    // On error, fail open to "keep"
    logger.error('llm_classification_failed', err, {
      model,
    });
    return {
      scores: null,
      source: 'error',
      model: model,
      latency: Date.now() - startTime,
    };
  }
}

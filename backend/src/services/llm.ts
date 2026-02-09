import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import retry from 'async-retry';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts';
import type { ScoreResult } from '../types/classification';
import {
  LLM_MAX_TOKENS,
  LLM_RETRY_ATTEMPTS,
  LLM_RETRY_MAX_TIMEOUT_MS,
  LLM_RETRY_MIN_TIMEOUT_MS,
  LLM_TEMPERATURE,
} from '../lib/policy-constants';

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

export interface LlmRuntimeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface LoggerLike {
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, error: unknown, meta?: Record<string, unknown>) => void;
}

export interface LlmService {
  classifyPost: (post: PostInput) => Promise<LLMCallResult>;
}

export interface LlmServiceDeps {
  config: LlmRuntimeConfig;
  logger: LoggerLike;
}

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

function constructUserPrompt(post: PostInput): string {
  const contentWithContext = `Author: ${post.author_name}\n\n${post.content_text}`;
  return USER_PROMPT.replace('{{POST_TEXT}}', contentWithContext);
}

function hasHttpStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status: unknown }).status === 'number';
}

async function callLLMWithRetry(
  openai: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  logger: LoggerLike,
) {
  return retry(
    async (bail) => {
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature: LLM_TEMPERATURE,
          max_tokens: LLM_MAX_TOKENS,
          response_format: zodResponseFormat(DecisionSchema, 'classification'),
          reasoning_effort: 'none',
        });

        const message = completion.choices[0]?.message;
        if (!message) {
          throw new Error('No completion choices returned');
        }

        if (message.refusal) {
          bail(new Error(`LLM refusal: ${message.refusal}`));
          return completion;
        }

        if (!message.content) {
          throw new Error('Empty response from LLM (content is null)');
        }

        return completion;
      } catch (error) {
        if (hasHttpStatus(error) && (error.status === 401 || error.status === 403)) {
          bail(error);
          throw error;
        }
        throw error;
      }
    },
    {
      retries: LLM_RETRY_ATTEMPTS,
      minTimeout: LLM_RETRY_MIN_TIMEOUT_MS,
      maxTimeout: LLM_RETRY_MAX_TIMEOUT_MS,
      randomize: true,
      onRetry: (error, attempt) => {
        logger.warn('llm_retry', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
  );
}

function parseAndValidateResponse(content: string | null): ScoreResult {
  if (!content) {
    throw new Error('Empty content received from LLM');
  }

  const parsed = JSON.parse(content);
  return DecisionSchema.parse(parsed);
}

export function createLlmService(deps: LlmServiceDeps): LlmService {
  const { config, logger } = deps;

  async function classifyPost(post: PostInput): Promise<LLMCallResult> {
    const startTime = Date.now();

    if (!config.apiKey || config.apiKey.startsWith('sk-or-dummy')) {
      logger.warn('llm_dev_fallback', { reason: 'missing_or_dummy_api_key' });
      return {
        scores: null,
        source: 'error',
        model: 'dev-fallback',
        latency: 0,
      };
    }

    if (!config.model) {
      throw new Error('LLM_MODEL environment variable is required');
    }

    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: constructUserPrompt(post) },
    ];

    try {
      const completion = await callLLMWithRetry(openai, config.model, messages, logger);
      const scores = parseAndValidateResponse(completion.choices[0]?.message.content ?? null);

      return {
        scores,
        source: 'llm',
        model: config.model,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('llm_classification_failed', error, { model: config.model });
      return {
        scores: null,
        source: 'error',
        model: config.model,
        latency: Date.now() - startTime,
      };
    }
  }

  return {
    classifyPost,
  };
}

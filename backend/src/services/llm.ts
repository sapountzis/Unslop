// LLM classification service using OpenRouter and OpenAI SDK
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import retry from 'async-retry';
import { CLASSIFICATION_PROMPT } from './prompts';

export interface PostInput {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface LLMCallResult {
  decision: 'keep' | 'dim' | 'hide';
  source: 'llm' | 'error';
  model: string;
  latency: number;
}

// enum thresholds
const KEEP_THRESHOLD = 0.4;
const DIM_THRESHOLD = 0.3;

// Score result interface
export interface ScoreResult {
  u: number;  // usefulness_score (higher is better)
  d: number;  // educational_depth_score (higher is better)
  c: number;  // human_connection_score (higher is better)
  h: number;  // humor_score (higher is better)
  rb: number; // rage_bait_score (lower is better)
  eb: number; // ego_bait_score (lower is better)
  sp: number; // sales_pitch_score (lower is better)
  ts: number; // template_slop_score (lower is better)
  sf: number; // spammy_formatting_score (lower is better)
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
});

/**
 * Composes a final decision (keep/dim/hide) from orthogonal scores.
 */
export function composeDecision(scores: ScoreResult): 'keep' | 'dim' | 'hide' {
  const { u, d, c, h, rb, eb, sp, ts, sf } = scores;

  const positiveSignal = (u + d + c + h);
  const nPositiveSignals = 4;
  const negativeSignal = (rb + eb + sp + ts + sf);
  const nNegativeSignals = 5;

  const compositeSignal = (positiveSignal + nNegativeSignals - negativeSignal) / (nPositiveSignals + nNegativeSignals);

  if (compositeSignal > KEEP_THRESHOLD) {
    return 'keep';
    // } else if (compositeSignal > DIM_THRESHOLD) {
    //   return 'dim';
  } else {
    return 'hide';
  }
}

function getOpenRouterConfig(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
  if (!model) {
    throw new Error('OPENROUTER_MODEL environment variable is required');
  }

  return {
    apiKey,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model,
  };
}

function constructPrompt(post: PostInput): string {
  // We prepend author info to the content to provide context, 
  // as the prompt placeholder {{POST_TEXT}} implies just the text, 
  // but author info is valuable for "ego_bait" assessment.
  const contentWithContext = `Author: ${post.author_name}\n\n${post.content_text}`;
  return CLASSIFICATION_PROMPT.replace('{{POST_TEXT}}', contentWithContext);
}

/**
 * Executes the LLM call with retry logic for transient failures
 */
async function callLLMWithRetry(openai: OpenAI, model: string, prompt: string) {
  return await retry(
    async (bail) => {
      try {
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'user', content: prompt },
          ],
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
        console.warn(`LLM call attempt ${attempt} failed: ${err.message}`);
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
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.startsWith('sk-or-dummy')) {
    console.log('⚠️ No real OpenRouter API key found, defaulting to "keep" (dev mode)');
    return {
      decision: 'keep',
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

  const prompt = constructPrompt(post);

  try {
    const completion = await callLLMWithRetry(openai, model, prompt);
    const scores = parseAndValidateResponse(completion.choices[0].message.content);
    const decision = composeDecision(scores);
    const latency = Date.now() - startTime;

    return {
      decision,
      source: 'llm',
      model: model,
      latency,
    };
  } catch (err) {
    // On error, fail open to "keep"
    console.error('LLM classification failed after retries:', err);
    return {
      decision: 'keep',
      source: 'error',
      model: model,
      latency: Date.now() - startTime,
    };
  }
}

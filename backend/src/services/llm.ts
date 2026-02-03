// LLM classification service using OpenRouter and OpenAI SDK
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
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

// Define the schema using Zod
const DecisionSchema = z.object({
  usefulness_score: z.number(),
  educational_depth_score: z.number(),
  human_connection_score: z.number(),
  humor_score: z.number(),
  rage_bait_score: z.number(),
  ego_bait_score: z.number(),
  sales_pitch_score: z.number(),
  template_slop_score: z.number(),
  spammy_formatting_score: z.number(),
  overall_quality_label: z.enum(['high_value', 'medium_value', 'low_value', 'spam_slop']),
  recommended_action: z.enum(['keep', 'dim', 'hide']),
  short_rationale: z.string(),
});

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

export async function classifyPost(post: PostInput): Promise<LLMCallResult> {
  const startTime = Date.now();

  // Fail fast if no API key (for local dev without key)
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.startsWith('sk-or-dummy')) {
    console.log('⚠️ No real OpenRouter API key found, defaulting to "keep" (dev mode)');
    return {
      decision: 'keep',
      source: 'error', // Treating missing key as "error" source to indicate fallback
      model: 'dev-fallback',
      latency: 0,
    };
  }

  const { apiKey, baseUrl, model } = getOpenRouterConfig();

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  // Construct the final prompt by replacing the placeholder
  // We prepend author info to the content to provide context, 
  // as the prompt placeholder {{POST_TEXT}} implies just the text, 
  // but author info is valuable for "ego_bait" assessment.
  const contentWithContext = `Author: ${post.author_name}\n\n${post.content_text}`;
  const finalPrompt = CLASSIFICATION_PROMPT.replace('{{POST_TEXT}}', contentWithContext);

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'user', content: finalPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: zodResponseFormat(DecisionSchema, 'classification'),
    });

    const message = completion.choices[0].message;

    if (message.refusal) {
      throw new Error(`LLM Refusal: ${message.refusal}`);
    }

    const content = message.content;

    if (!content) {
      throw new Error('Empty response from LLM (content is null)');
    }

    const parsed = JSON.parse(content);

    // Validate again with Zod
    const result = DecisionSchema.parse(parsed);

    const latency = Date.now() - startTime;

    return {
      decision: result.recommended_action, // Map new action to old decision field
      source: 'llm',
      model: model,
      latency,
    };
  } catch (err) {
    // On error, fail open to "keep"
    console.error('LLM classification failed:', err);
    return {
      decision: 'keep',
      source: 'error',
      model: model,
      latency: Date.now() - startTime,
    };
  }
}

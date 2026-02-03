// LLM classification service using OpenRouter
export interface PostInput {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface ClassificationResult {
  decision: 'keep' | 'dim' | 'hide';
}

export interface LLMCallResult {
  decision: 'keep' | 'dim' | 'hide';
  model: string;
  latency: number;
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

const SYSTEM_PROMPT = `You are a strict JSON generator. Your job is to decide if a LinkedIn post should be kept, dimmed, or hidden.

Rules:
- Keep posts that are genuine, thoughtful, or from real connections.
- Dim posts that are low-quality but not harmful (vague platitudes, engagement bait).
- Hide posts that are spam, scams, or clearly automated nonsense.

When uncertain, default to "keep".

Output ONLY a JSON object with this exact schema:
{"decision": "keep" | "dim" | "hide"}`;

export async function classifyPost(post: PostInput): Promise<LLMCallResult> {
  const startTime = Date.now();
  const { apiKey, baseUrl, model } = getOpenRouterConfig();

  const userMessage = `Author: ${post.author_name} (ID: ${post.author_id})
Content: ${post.content_text}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://getunslop.com',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 50,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const parsed = JSON.parse(content) as ClassificationResult;

    if (!['keep', 'dim', 'hide'].includes(parsed.decision)) {
      throw new Error(`Invalid decision: ${parsed.decision}`);
    }

    const latency = Date.now() - startTime;

    return {
      decision: parsed.decision,
      model: model,
      latency,
    };
  } catch (err) {
    // On error, fail open to "keep"
    console.error('LLM classification failed:', err);
    return {
      decision: 'keep',
      model: model,
      latency: Date.now() - startTime,
    };
  }
}

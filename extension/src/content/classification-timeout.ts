import { Decision, Source } from '../types';

type ClassificationResult = { decision: Decision; source: Source };

const FAIL_OPEN_RESULT: ClassificationResult = {
  decision: 'keep',
  source: 'error',
};

/**
 * Enforce a fail-open timeout so posts never stay hidden forever while waiting for classification.
 */
export async function classifyPostWithTimeout(
  classificationPromise: Promise<ClassificationResult>,
  timeoutMs: number
): Promise<ClassificationResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<ClassificationResult>((resolve) => {
      timer = setTimeout(() => resolve(FAIL_OPEN_RESULT), timeoutMs);
    });

    return await Promise.race([classificationPromise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

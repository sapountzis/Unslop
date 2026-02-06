import { extractPostData, isLikelyFeedPostRoot } from './linkedin-parser';
import { renderDecision } from './decision-renderer';
import { Decision, PostData, Source } from '../types';
import { decisionCache, userData } from '../lib/storage';
import { enqueueBatch, handleBatchResult } from './batch-queue';
import { SELECTORS, ATTRIBUTES } from '../lib/selectors';
import { DEBUG_CONTENT_RUNTIME, HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { MESSAGE_TYPES } from '../lib/messages';
import { routeKeyFromUrl, shouldFilterRoute, shouldFilterRouteKey } from './route-detector';
import { createMutationBuffer } from './mutation-buffer';
import { createStarvationWatchdog } from './starvation-watchdog';
import { createAttachmentController } from './attachment-controller';
import { clearUnslopStateInDocument } from './marker-manager';
import { createRuntimeController } from './runtime-controller';
import { HIDE_RENDER_MODE_STORAGE_KEY, resolveHideRenderMode } from '../lib/hide-render-mode';
import '../styles/content.css';

const ROUTE_POLL_MS = 500;
const WATCHDOG_POLL_MS = 1000;
const PROCESS_PER_FRAME = 20;

const runtimeCounters = {
  postsProcessed: 0,
  classifySent: 0,
};

let frameHandle = 0;
let hideRenderMode: HideRenderMode = HIDE_RENDER_MODE;

function setPreclassifyGate(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTRIBUTES.preclassify, 'true');
    return;
  }
  document.documentElement.removeAttribute(ATTRIBUTES.preclassify);
}

function debugLog(message: string, context?: unknown): void {
  if (!DEBUG_CONTENT_RUNTIME) return;
  if (typeof context === 'undefined') {
    console.debug(`[Unslop][runtime] ${message}`);
    return;
  }
  console.debug(`[Unslop][runtime] ${message}`, context);
}

function incrementCounter(key: keyof typeof runtimeCounters): void {
  runtimeCounters[key] += 1;
}

const mutationBuffer = createMutationBuffer((element) => {
  processPost(element).catch((err) => {
    console.error('[Unslop] process post failed', err);
  });
});

function shouldSkipElement(element: HTMLElement): boolean {
  return (
    !isLikelyFeedPostRoot(element) ||
    element.hasAttribute(ATTRIBUTES.processed) ||
    element.hasAttribute(ATTRIBUTES.processing)
  );
}

async function classifyPost(postData: PostData): Promise<{ decision: Decision; source: Source }> {
  const postId = postData.post_id;
  debugLog('classify start', { postId });
  incrementCounter('classifySent');

  const cached = await decisionCache.get(postId);
  if (cached) {
    debugLog('classify cache-hit', { postId, decision: cached.decision });
    return { decision: cached.decision, source: cached.source };
  }

  try {
    const result = await enqueueBatch(postData);
    debugLog('classify response', { postId, decision: result.decision, source: result.source });
    await decisionCache.set(postId, result.decision, result.source);
    return result;
  } catch (err) {
    console.error('Classification failed:', err);
    return { decision: 'keep', source: 'error' };
  }
}

async function processPost(element: HTMLElement): Promise<void> {
  if (!runtimeController.isEnabledForProcessing()) return;
  if (shouldSkipElement(element)) return;

  element.setAttribute(ATTRIBUTES.processing, 'true');

  try {
    const postData = await extractPostData(element);
    if (!runtimeController.isEnabledForProcessing()) return;

    if (!postData) {
      renderDecision(element, 'keep');
      incrementCounter('postsProcessed');
      return;
    }

    const { decision } = await classifyPost(postData);
    if (!runtimeController.isEnabledForProcessing()) return;
    renderDecision(element, decision, postData.post_id, { hideMode: hideRenderMode });
    incrementCounter('postsProcessed');
  } catch (err) {
    console.error('Error processing post:', err);
    if (!runtimeController.isEnabledForProcessing()) return;
    // Fail open and guarantee terminal state so posts cannot remain hidden forever.
    renderDecision(element, 'keep');
    incrementCounter('postsProcessed');
  } finally {
    element.removeAttribute(ATTRIBUTES.processing);
  }
}

function reconcileHiddenPostRenderMode(): void {
  if (!runtimeController.isEnabledForProcessing()) return;
  const hiddenPosts = document.querySelectorAll(
    `${SELECTORS.candidatePostRoot}[${ATTRIBUTES.decision}="hide"]`
  );

  for (const post of hiddenPosts) {
    if (post instanceof HTMLElement) {
      renderDecision(post, 'hide', undefined, { hideMode: hideRenderMode });
    }
  }
}

function enqueueCandidate(element: HTMLElement): void {
  if (!runtimeController.isEnabledForProcessing()) return;
  if (!isLikelyFeedPostRoot(element)) return;
  mutationBuffer.enqueue(element);
}

function collectCandidatesFromNode(node: Node): void {
  if (!(node instanceof HTMLElement)) return;

  if (node.matches(SELECTORS.candidatePostRoot)) {
    enqueueCandidate(node);
  }

  const nested = node.querySelectorAll(SELECTORS.candidatePostRoot);
  for (const child of nested) {
    if (child instanceof HTMLElement) {
      enqueueCandidate(child);
    }
  }
}

function flushMutationBuffer(): void {
  frameHandle = 0;
  if (!runtimeController.isEnabledForProcessing()) {
    mutationBuffer.clear();
    return;
  }
  mutationBuffer.drain(PROCESS_PER_FRAME);
  if (mutationBuffer.size() > 0) {
    scheduleBufferFlush();
  }
}

function scheduleBufferFlush(): void {
  if (frameHandle !== 0) return;
  frameHandle = window.requestAnimationFrame(flushMutationBuffer);
}

function stopProcessingLoop(): void {
  mutationBuffer.clear();
  if (frameHandle !== 0) {
    window.cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  }
}

function scanForPosts(): void {
  if (!runtimeController.isEnabledForProcessing()) return;

  const roots = document.querySelectorAll(SELECTORS.candidatePostRoot);
  for (const root of roots) {
    if (root instanceof HTMLElement) {
      enqueueCandidate(root);
    }
  }
  scheduleBufferFlush();
}

function handleMutations(mutations: MutationRecord[], generation: number): void {
  if (!attachmentController.isCurrentGeneration(generation)) return;

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      collectCandidatesFromNode(node);
    }
  }

  scheduleBufferFlush();
}

const attachmentController = createAttachmentController({
  isRouteEligible: shouldFilterRouteKey,
  findFeedRoot: () => document.querySelector(SELECTORS.feed),
  attachFeedObserver: ({ routeKey, generation, feedRoot }) => {
    debugLog('attach feed observer', { routeKey, generation });

    const observer = new MutationObserver((mutations) => handleMutations(mutations, generation));
    observer.observe(feedRoot, { childList: true, subtree: true });
    scanForPosts();

    return {
      disconnect: () => observer.disconnect(),
    };
  },
  attachBodyObserver: ({ routeKey, onFeedAvailable }) => {
    const observer = new MutationObserver(() => {
      const runtimeState = runtimeController.getState();
      const currentRoute = routeKeyFromUrl(window.location.href);
      if (
        runtimeState.mode === 'disabled' ||
        runtimeState.routeKey !== routeKey ||
        currentRoute !== routeKey ||
        !shouldFilterRouteKey(currentRoute)
      ) {
        return;
      }

      if (!document.querySelector(SELECTORS.feed)) return;
      onFeedAvailable();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return {
      disconnect: () => observer.disconnect(),
    };
  },
});

const watchdog = createStarvationWatchdog(() => {
  scheduleRuntimeReconcile('watchdog');
});

const runtimeController = createRuntimeController({
  getRouteKey: () => routeKeyFromUrl(window.location.href),
  isRouteEligible: shouldFilterRouteKey,
  readEnabled: () => userData.isEnabled(),
  enterDisabled: () => {
    attachmentController.detachAll();
    stopProcessingLoop();
    setPreclassifyGate(false);
    watchdog.reset();
    clearUnslopStateInDocument();
  },
  enterEnabled: ({ routeKey, forceAttach }) => {
    setPreclassifyGate(true);
    attachmentController.ensureAttached({ routeKey, force: forceAttach });
    scanForPosts();
  },
  isAttachmentLive: (routeKey) => attachmentController.isLive(routeKey),
});

function scheduleRuntimeReconcile(reason: 'init' | 'route' | 'toggle' | 'visibility' | 'watchdog'): void {
  window.setTimeout(() => {
    runtimeController.reconcile(reason).catch((err) => {
      console.error('[Unslop] runtime reconcile failed', { reason, err });
    });
  }, 0);
}

function setupNavigationDetection(): void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  window.addEventListener('popstate', () => {
    scheduleRuntimeReconcile('route');
  });
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRuntimeReconcile('visibility');
  });

  history.pushState = function (...args) {
    originalPushState(...args);
    scheduleRuntimeReconcile('route');
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    scheduleRuntimeReconcile('route');
  };

  window.setInterval(() => {
    if (document.hidden) return;
    const nextRoute = routeKeyFromUrl(window.location.href);
    if (nextRoute !== runtimeController.getState().routeKey) {
      scheduleRuntimeReconcile('route');
    }
  }, ROUTE_POLL_MS);
}

function startWatchdog(): void {
  let lastProcessed = runtimeCounters.postsProcessed;
  let lastClassify = runtimeCounters.classifySent;

  window.setInterval(() => {
    if (!runtimeController.isEnabledForProcessing() || document.hidden) return;

    const state = attachmentController.getState();
    if (!state.feedObserverActive && !state.bodyObserverActive) return;

    const processedNow = runtimeCounters.postsProcessed;
    const classifyNow = runtimeCounters.classifySent;

    const processedDelta = processedNow - lastProcessed;
    const classifyDelta = classifyNow - lastClassify;
    lastProcessed = processedNow;
    lastClassify = classifyNow;

    const candidatesVisible = document.querySelectorAll(
      `${SELECTORS.candidatePostRoot}:not([${ATTRIBUTES.processed}])`
    ).length;

    watchdog.tick({
      candidatesVisible,
      processedDelta,
      classifyDelta,
      observerLive: attachmentController.isLive(),
    });
  }, WATCHDOG_POLL_MS);
}

async function hydrateHideRenderMode(): Promise<void> {
  try {
    const storage = await chrome.storage.sync.get(HIDE_RENDER_MODE_STORAGE_KEY);
    hideRenderMode = resolveHideRenderMode(storage[HIDE_RENDER_MODE_STORAGE_KEY]);
  } catch (err) {
    console.error('[Unslop] failed to hydrate hide render mode', err);
  }
}

async function initializeRuntime(): Promise<void> {
  decisionCache.cleanupExpired().catch(console.error);
  await hydrateHideRenderMode();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MESSAGE_TYPES.CLASSIFY_BATCH_RESULT) {
      handleBatchResult(message.item);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes.enabled) {
      scheduleRuntimeReconcile('toggle');
    }
    if (changes[HIDE_RENDER_MODE_STORAGE_KEY]) {
      hideRenderMode = resolveHideRenderMode(changes[HIDE_RENDER_MODE_STORAGE_KEY].newValue);
      window.requestAnimationFrame(reconcileHiddenPostRenderMode);
    }
  });

  setupNavigationDetection();
  startWatchdog();
  scheduleRuntimeReconcile('init');
}

if (shouldFilterRoute(window.location.href)) {
  setPreclassifyGate(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initializeRuntime();
  });
} else {
  void initializeRuntime();
}

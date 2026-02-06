import { extractPostData, isLikelyFeedPostRoot } from './linkedin-parser';
import { renderDecision } from './decision-renderer';
import { Decision, PostData, Source } from '../types';
import { decisionCache, userData } from '../lib/storage';
import { enqueueBatch, handleBatchResult } from './batch-queue';
import { SELECTORS, ATTRIBUTES } from '../lib/selectors';
import { CLASSIFY_TIMEOUT_MS, HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { classifyPostWithTimeout } from './classification-timeout';
import { MESSAGE_TYPES } from '../lib/messages';
import { createRuntimeMetrics } from './runtime-metrics';
import { routeKeyFromUrl, shouldFilterRoute, shouldFilterRouteKey } from './route-detector';
import { createMutationBuffer } from './mutation-buffer';
import { createStarvationWatchdog } from './starvation-watchdog';
import { createAttachmentController } from './attachment-controller';
import { clearUnslopStateInDocument } from './marker-manager';
import { disableGate, enableGateImmediately, syncGateWithEnabledState } from './preclassify-gate';
import { createRuntimeController } from './runtime-controller';
import { HIDE_RENDER_MODE_STORAGE_KEY, resolveHideRenderMode } from '../lib/hide-render-mode';
import '../styles/content.css';

const ROUTE_POLL_MS = 500;
const WATCHDOG_POLL_MS = 1000;
const PROCESS_PER_FRAME = 20;

const runtimeMetrics = createRuntimeMetrics();

let frameHandle = 0;
let currentRouteKey = '';
let hideRenderMode: HideRenderMode = HIDE_RENDER_MODE;

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
  console.debug('[Unslop][classify] start', { postId });
  runtimeMetrics.inc('classify_sent');

  const cached = await decisionCache.get(postId);
  if (cached) {
    runtimeMetrics.inc('classify_result');
    console.debug('[Unslop][classify] cache-return', { postId, decision: cached.decision });
    return { decision: cached.decision, source: cached.source };
  }

  try {
    const result = await enqueueBatch(postData);
    runtimeMetrics.inc('classify_result');
    console.debug('[Unslop][classify] response', { postId, decision: result.decision, source: result.source });
    await decisionCache.set(postId, result.decision, result.source);
    return result;
  } catch (err) {
    runtimeMetrics.inc('process_errors');
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
      runtimeMetrics.inc('posts_processed');
      return;
    }

    const { decision } = await classifyPostWithTimeout(
      classifyPost(postData),
      CLASSIFY_TIMEOUT_MS
    );
    if (!runtimeController.isEnabledForProcessing()) return;
    renderDecision(element, decision, postData.post_id, { hideMode: hideRenderMode });
    runtimeMetrics.inc('posts_processed');
  } catch (err) {
    runtimeMetrics.inc('process_errors');
    console.error('Error processing post:', err);
    if (!runtimeController.isEnabledForProcessing()) return;
    // Fail open and guarantee terminal state so posts cannot remain hidden forever.
    renderDecision(element, 'keep');
    runtimeMetrics.inc('posts_processed');
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
  runtimeMetrics.inc('candidates_seen');
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
    runtimeMetrics.inc('mutations_seen');
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
    runtimeMetrics.set('observer_generation', generation);
    runtimeMetrics.set('active_feed_selector', SELECTORS.feed);
    runtimeMetrics.set('active_route', routeKey);

    const observer = new MutationObserver((mutations) => handleMutations(mutations, generation));
    observer.observe(feedRoot, { childList: true, subtree: true });
    scanForPosts();

    return {
      disconnect: () => observer.disconnect(),
    };
  },
  attachBodyObserver: ({ routeKey, onFeedAvailable }) => {
    const observer = new MutationObserver(() => {
      if (currentRouteKey !== routeKey || !shouldFilterRoute(window.location.href)) {
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
  enterDisabled: (routeKey) => {
    currentRouteKey = routeKey;
    attachmentController.detachAll();
    stopProcessingLoop();
    disableGate();
    watchdog.reset();
    clearUnslopStateInDocument();
  },
  enterEnabled: ({ routeKey, forceAttach }) => {
    syncGateWithEnabledState(true);
    if (forceAttach) {
      runtimeMetrics.inc('observer_reattach');
    }
    attachmentController.ensureAttached({ routeKey, force: forceAttach });
    currentRouteKey = routeKey;
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
    if (nextRoute !== currentRouteKey) {
      scheduleRuntimeReconcile('route');
    }
  }, ROUTE_POLL_MS);
}

function startWatchdog(): void {
  let lastProcessed = runtimeMetrics.get('posts_processed');
  let lastClassify = runtimeMetrics.get('classify_sent');

  window.setInterval(() => {
    if (!runtimeController.isEnabledForProcessing() || document.hidden) return;

    const state = attachmentController.getState();
    if (!state.feedObserverActive && !state.bodyObserverActive) return;

    const processedNow = runtimeMetrics.get('posts_processed');
    const classifyNow = runtimeMetrics.get('classify_sent');

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
  enableGateImmediately();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initializeRuntime();
  });
} else {
  void initializeRuntime();
}

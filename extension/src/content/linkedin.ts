import { extractPostData, readPostIdentity } from './linkedin-parser';
import { renderDecision } from './decision-renderer';
import { Decision, PostData, Source } from '../types';
import { decisionCache, userData } from '../lib/storage';
import { enqueueBatch, getPendingBatchCount, handleBatchResult } from './batch-queue';
import { ATTRIBUTES, SELECTORS } from '../lib/selectors';
import { DEBUG_CONTENT_RUNTIME, HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { MESSAGE_TYPES } from '../lib/messages';
import { routeKeyFromUrl, shouldFilterRoute, shouldFilterRouteKey } from './route-detector';
import { createMutationBuffer } from './mutation-buffer';
import { createStarvationWatchdog } from './starvation-watchdog';
import { createAttachmentController } from './attachment-controller';
import { clearUnslopStateInDocument, resetPostElementState } from './marker-manager';
import { createRuntimeController } from './runtime-controller';
import { HIDE_RENDER_MODE_STORAGE_KEY, resolveHideRenderMode } from '../lib/hide-render-mode';
import { resolvePostSurface } from './post-surface';
import { createVisibilityIndex } from './visibility-index';
import { createRenderCommitPipeline } from './render-commit-pipeline';
import { createRuntimeLifecycle } from './runtime-lifecycle';
import '../styles/content.css';

const ROUTE_POLL_MS = 500;
const WATCHDOG_POLL_MS = 1000;
const PROCESS_PER_FRAME = 20;

const runtimeCounters = {
  postsProcessed: 0,
  classifySent: 0,
};

type TerminalState = {
  identity: string;
  decision: Decision;
};

type DebugContext = Record<string, string | number | boolean | null | undefined>;

let frameHandle = 0;
let hideRenderMode: HideRenderMode = HIDE_RENDER_MODE;
let inFlightProcessCount = 0;
let terminalStateByRoot = new WeakMap<HTMLElement, TerminalState>();
let renderCommitPipelineRef: ReturnType<typeof createRenderCommitPipeline> | null = null;

function setPreclassifyGate(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTRIBUTES.preclassify, 'true');
    return;
  }
  document.documentElement.removeAttribute(ATTRIBUTES.preclassify);
}

function debugLog(message: string, context?: DebugContext): void {
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

const visibilityIndex = createVisibilityIndex({
  onVisibilityChange: () => {
    renderCommitPipelineRef?.requestFlush();
  },
});

const renderCommitPipeline = createRenderCommitPipeline({
  render: renderDecision,
  visibility: visibilityIndex,
});
renderCommitPipelineRef = renderCommitPipeline;

const runtimeLifecycle = createRuntimeLifecycle();

function hasTerminalState(renderRoot: HTMLElement, identity: string): boolean {
  const terminal = terminalStateByRoot.get(renderRoot);
  if (!terminal) return false;
  return terminal.identity === identity;
}

function setTerminalState(renderRoot: HTMLElement, identity: string, decision: Decision): void {
  terminalStateByRoot.set(renderRoot, { identity, decision });
}

function syncSurfaceIdentity(renderRoot: HTMLElement, identity: string): void {
  const previousIdentity = renderRoot.getAttribute(ATTRIBUTES.identity);
  if (previousIdentity && previousIdentity !== identity) {
    terminalStateByRoot.delete(renderRoot);
    resetPostElementState(renderRoot);
  }

  renderRoot.setAttribute(ATTRIBUTES.identity, identity);
}

function shouldSkipSurfaceProcessing(renderRoot: HTMLElement, identity: string): boolean {
  if (renderRoot.hasAttribute(ATTRIBUTES.processing)) return true;
  if (renderRoot.hasAttribute(ATTRIBUTES.processed)) return true;
  return hasTerminalState(renderRoot, identity);
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

const mutationBuffer = createMutationBuffer((candidate) => {
  processPost(candidate).catch((err) => {
    console.error('[Unslop] process post failed', err);
  });
});

function enqueueCandidate(node: HTMLElement): void {
  if (!runtimeController.isEnabledForProcessing()) return;

  const surface = resolvePostSurface(node);
  if (!surface) return;

  syncSurfaceIdentity(surface.renderRoot, surface.identity);
  visibilityIndex.observe(surface.renderRoot);

  if (shouldSkipSurfaceProcessing(surface.renderRoot, surface.identity)) {
    return;
  }

  mutationBuffer.enqueue(surface.contentRoot);
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
  renderCommitPipeline.clear();

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

async function processPost(candidate: HTMLElement): Promise<void> {
  if (!runtimeController.isEnabledForProcessing()) return;

  const surface = resolvePostSurface(candidate);
  if (!surface) return;

  syncSurfaceIdentity(surface.renderRoot, surface.identity);
  visibilityIndex.observe(surface.renderRoot);

  if (shouldSkipSurfaceProcessing(surface.renderRoot, surface.identity)) {
    return;
  }

  surface.renderRoot.setAttribute(ATTRIBUTES.processing, 'true');
  inFlightProcessCount += 1;
  let handedToRenderPipeline = false;

  try {
    const postData = await extractPostData(surface.contentRoot);
    if (!runtimeController.isEnabledForProcessing()) return;

    if (!postData) {
      renderDecision(surface.renderRoot, 'keep');
      setTerminalState(surface.renderRoot, surface.identity, 'keep');
      incrementCounter('postsProcessed');
      return;
    }

    const runtimeSnapshot = runtimeController.getState();
    const attachmentSnapshot = attachmentController.getState();
    const expectedIdentity = surface.identity;
    const expectedRenderRoot = surface.renderRoot;

    const { decision } = await classifyPost(postData);

    const canApplyDecisionNow = (): boolean => {
      if (!runtimeController.isEnabledForProcessing()) return false;

      const currentRuntimeState = runtimeController.getState();
      if (currentRuntimeState.routeKey !== runtimeSnapshot.routeKey) return false;
      if (!attachmentController.isCurrentGeneration(attachmentSnapshot.generation)) return false;
      if (!expectedRenderRoot.isConnected) return false;

      const currentIdentity =
        expectedRenderRoot.getAttribute(ATTRIBUTES.identity) ??
        readPostIdentity(expectedRenderRoot) ??
        readPostIdentity(surface.contentRoot);

      if (!currentIdentity) return false;
      return currentIdentity === expectedIdentity;
    };

    if (!canApplyDecisionNow()) {
      surface.renderRoot.removeAttribute(ATTRIBUTES.processing);
      if (runtimeController.isEnabledForProcessing()) {
        enqueueCandidate(surface.contentRoot);
        scheduleBufferFlush();
      }
      return;
    }

    handedToRenderPipeline = true;
    renderCommitPipeline.enqueue({
      renderRoot: expectedRenderRoot,
      decision,
      postId: postData.post_id,
      hideMode: hideRenderMode,
      isStillValid: () => canApplyDecisionNow(),
      onFinalized: (status) => {
        if (status === 'applied') {
          setTerminalState(expectedRenderRoot, expectedIdentity, decision);
          incrementCounter('postsProcessed');
          return;
        }

        expectedRenderRoot.removeAttribute(ATTRIBUTES.processing);
        if (!runtimeController.isEnabledForProcessing()) return;
        enqueueCandidate(surface.contentRoot);
        scheduleBufferFlush();
      },
    });
  } catch (err) {
    console.error('Error processing post:', err);
    if (!runtimeController.isEnabledForProcessing()) return;

    renderDecision(surface.renderRoot, 'keep');
    setTerminalState(surface.renderRoot, surface.identity, 'keep');
    incrementCounter('postsProcessed');
  } finally {
    inFlightProcessCount = Math.max(0, inFlightProcessCount - 1);
    if (!handedToRenderPipeline) {
      surface.renderRoot.removeAttribute(ATTRIBUTES.processing);
    }
  }
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

function startRuntimeWatchdog(): void {
  let lastProcessed = runtimeCounters.postsProcessed;
  let lastClassify = runtimeCounters.classifySent;

  const timerId = window.setInterval(() => {
    if (!runtimeController.isEnabledForProcessing() || document.hidden) return;

    const state = attachmentController.getState();
    if (!state.feedObserverActive && !state.bodyObserverActive) return;

    const processedNow = runtimeCounters.postsProcessed;
    const classifyNow = runtimeCounters.classifySent;
    const processedDelta = processedNow - lastProcessed;
    const classifyDelta = classifyNow - lastClassify;
    lastProcessed = processedNow;
    lastClassify = classifyNow;

    const backlogSize =
      mutationBuffer.size() +
      renderCommitPipeline.size() +
      inFlightProcessCount +
      getPendingBatchCount();

    watchdog.tick({
      backlogSize,
      processedDelta,
      classifyDelta,
      pendingBatchCount: getPendingBatchCount(),
      observerLive: attachmentController.isLive(),
    });
  }, WATCHDOG_POLL_MS);

  runtimeLifecycle.registerCleanup(() => {
    window.clearInterval(timerId);
  });
}

function initializeRuntimeForRoute(routeKey: string, forceAttach: boolean): void {
  const currentRoute = runtimeLifecycle.routeKey();
  const shouldReinitialize = !runtimeLifecycle.isActive() || currentRoute !== routeKey || forceAttach;

  if (shouldReinitialize) {
    runtimeLifecycle.dispose();
    runtimeLifecycle.activate(routeKey);

    runtimeLifecycle.registerCleanup(() => {
      attachmentController.detachAll();
      stopProcessingLoop();
      visibilityIndex.clear();
      setPreclassifyGate(false);
      watchdog.reset();
      clearUnslopStateInDocument();
      terminalStateByRoot = new WeakMap<HTMLElement, TerminalState>();
      inFlightProcessCount = 0;
    });

    startRuntimeWatchdog();
  }

  setPreclassifyGate(true);
  attachmentController.ensureAttached({ routeKey, force: forceAttach });
  scanForPosts();
}

function disposeRuntime(): void {
  runtimeLifecycle.dispose();
}

const runtimeController = createRuntimeController({
  getRouteKey: () => routeKeyFromUrl(window.location.href),
  isRouteEligible: shouldFilterRouteKey,
  readEnabled: () => userData.isEnabled(),
  enterDisabled: () => {
    disposeRuntime();
  },
  enterEnabled: ({ routeKey, forceAttach }) => {
    initializeRuntimeForRoute(routeKey, forceAttach);
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
    if (!document.hidden) {
      scheduleRuntimeReconcile('visibility');
    }
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
    }
  });

  setupNavigationDetection();
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

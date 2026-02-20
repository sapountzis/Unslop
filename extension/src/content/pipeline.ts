// Pipeline — the core orchestrator.
//
// Lifecycle: start() → [observe mutations] → processNode() → detect → parse → classify → render
// Route changes re-attach the observer. Toggle/storage changes update enabled/hideMode.
import type { PlatformPlugin } from "../platforms/platform";
import type { BatchClassifyResult } from "../types";
import { MESSAGE_TYPES } from "../lib/messages";
import { PERSIST_INTERVAL_MS, SYNC_STORAGE_AREA } from "../lib/config";
import {
	HIDE_RENDER_MODE_STORAGE_KEY,
	resolveHideRenderMode,
} from "../lib/hideRenderMode";
import { resolveEnabled } from "../lib/enabledState";
import { resolveDevMode, DEV_MODE_STORAGE_KEY } from "../lib/devMode";
import { decisionCache } from "../lib/storage";
import { ATTRIBUTES } from "../lib/selectors";
import { collectContentDiagnostics } from "../platforms/platformDiagnostics";
import { FeedObserver } from "./observer";
import { collectHints, detectPost, scanFeed } from "./detector";
import { Classifier } from "./classifier";
import { renderDecision, clearAllDecisions } from "./renderer";
import { NavigationHandler } from "./navigation";
import { createState } from "./state";

export class Pipeline {
	private readonly state = createState();
	private readonly observer: FeedObserver;
	private readonly classifier: Classifier;
	private readonly nav: NavigationHandler;
	private messageListener:
		| ((
				msg: unknown,
				sender: unknown,
				sendResponse: (r: unknown) => void,
		  ) => true | undefined)
		| null = null;
	private storageListener:
		| ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
		| null = null;
	private persistIntervalId: ReturnType<typeof setInterval> | null = null;
	constructor(private readonly platform: PlatformPlugin) {
		this.classifier = new Classifier(
			(msg) =>
				chrome.runtime.sendMessage(msg) as Promise<{
					status: "ok" | "disabled" | "error";
				}>,
		);
		this.observer = new FeedObserver(
			() => platform.findFeedRoot(),
			(nodes) => this.onNodes(nodes),
			() => this.onFeedAttached(),
		);
		this.nav = new NavigationHandler(() => this.onRouteChange());
	}
	async start(): Promise<void> {
		decisionCache.cleanupExpired().catch(console.error);
		await this.hydrateSettings();
		this.setupMessageListener();
		this.setupStorageListener();
		this.nav.setup();
		this.persistIntervalId = setInterval(
			() => decisionCache.cleanupExpired().catch(console.error),
			PERSIST_INTERVAL_MS,
		);
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => this.reconcile());
		} else {
			this.reconcile();
		}
	}
	stop(): void {
		this.nav.dispose();
		this.observer.detach();
		this.classifier.reset();
		clearAllDecisions();
		if (this.persistIntervalId !== null) {
			clearInterval(this.persistIntervalId);
			this.persistIntervalId = null;
		}
		if (this.messageListener) {
			chrome.runtime.onMessage.removeListener(this.messageListener);
			this.messageListener = null;
		}
		if (this.storageListener) {
			chrome.storage.onChanged.removeListener(this.storageListener);
			this.storageListener = null;
		}
	}
	// ── Private ────────────────────────────────────────────────────────────────
	private reconcile(): void {
		const routeKey = this.platform.routeKeyFromUrl(window.location.href);
		const eligible = this.platform.shouldFilterRouteKey(routeKey);
		if (!this.state.enabled || !eligible) {
			if (this.observer.isLive) {
				this.observer.detach();
				this.classifier.reset();
				clearAllDecisions();
			}
			this.state.routeKey = routeKey;
			return;
		}
		const routeChanged = routeKey !== this.state.routeKey;
		this.state.routeKey = routeKey;
		if (routeChanged) {
			this.observer.detach();
			this.classifier.reset();
			this.state.processed = new WeakSet();
		}
		this.observer.attach();
	}
	private onRouteChange(): void {
		this.reconcile();
	}
	private onFeedAttached(): void {
		// Scan the full feed on initial attach to catch posts already in the DOM.
		const feedRoot = this.platform.findFeedRoot();
		if (!feedRoot) return;
		const surfaces = scanFeed(feedRoot, this.platform.detectionProfile, (el) =>
			this.platform.readPostIdentity(el),
		);
		for (const surface of surfaces) {
			void this.processSurface(surface);
		}
	}
	private onNodes(nodes: Node[]): void {
		if (!this.state.enabled) return;
		const seen = new WeakSet<HTMLElement>();
		for (const node of nodes) {
			const hints = collectHints(
				node,
				this.platform.detectionProfile.hintSelectors,
			);
			for (const hint of hints) {
				const surface = detectPost(hint, this.platform.detectionProfile, (el) =>
					this.platform.readPostIdentity(el),
				);
				if (!surface) continue;
				if (seen.has(surface.renderRoot)) continue;
				seen.add(surface.renderRoot);
				void this.processSurface(surface);
			}
		}
	}
	private async processSurface(surface: {
		contentRoot: HTMLElement;
		renderRoot: HTMLElement;
		labelRoot: HTMLElement;
		identity: string;
	}): Promise<void> {
		if (!this.state.enabled) return;
		// Skip already-processed or currently-processing elements.
		if (
			surface.renderRoot.hasAttribute(ATTRIBUTES.processed) ||
			surface.renderRoot.hasAttribute(ATTRIBUTES.processing)
		) {
			return;
		}
		if (this.state.processed.has(surface.renderRoot)) return;
		surface.renderRoot.setAttribute(ATTRIBUTES.processing, "true");
		try {
			const postData = await this.platform.extractPostData(surface.contentRoot);
			if (!postData || !this.state.enabled) {
				// Parse failed — keep visible, mark done.
				renderDecision(surface.labelRoot, "keep", this.state.hideMode);
				this.state.processed.add(surface.renderRoot);
				return;
			}
			const { decision } = await this.classifier.classify(postData);
			if (!this.state.enabled) return;
			if (!surface.renderRoot.isConnected) return;
			renderDecision(surface.labelRoot, decision, this.state.hideMode);
			this.state.processed.add(surface.renderRoot);
		} catch (err) {
			console.error("[Unslop] Error processing post:", err);
			renderDecision(surface.labelRoot, "keep", this.state.hideMode);
			this.state.processed.add(surface.renderRoot);
		} finally {
			surface.renderRoot.removeAttribute(ATTRIBUTES.processing);
		}
	}
	private async hydrateSettings(): Promise<void> {
		try {
			const storage = await chrome.storage.sync.get([
				"enabled",
				HIDE_RENDER_MODE_STORAGE_KEY,
			]);
			this.state.enabled = resolveEnabled(
				storage.enabled as boolean | undefined,
			);
			this.state.hideMode = resolveHideRenderMode(
				storage[HIDE_RENDER_MODE_STORAGE_KEY] as string | undefined,
			);
		} catch (err) {
			console.error(
				`[Unslop][${this.platform.id}] failed to load settings`,
				err,
			);
		}
	}
	private setupMessageListener(): void {
		this.messageListener = (
			msg: unknown,
			_sender: unknown,
			sendResponse: (r: unknown) => void,
		): true | undefined => {
			if (!msg || typeof msg !== "object" || !("type" in msg)) return;
			const m = msg as { type: string; item?: BatchClassifyResult };
			if (m.type === MESSAGE_TYPES.CLASSIFY_BATCH_RESULT && m.item) {
				this.classifier.onBatchResult(m.item);
				return;
			}
			if (m.type === MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS) {
				void (async () => {
					try {
						const storage = await chrome.storage.sync.get(DEV_MODE_STORAGE_KEY);
						const devMode = resolveDevMode(
							storage[DEV_MODE_STORAGE_KEY] as boolean | null | undefined,
						);
						if (!devMode) {
							sendResponse({
								status: "disabled",
								reason: "Developer mode is disabled.",
							});
							return;
						}
						const routeKey = this.platform.routeKeyFromUrl(
							window.location.href,
						);
						const snapshot = collectContentDiagnostics(
							this.platform.id,
							window.location.href,
							routeKey,
							this.platform.shouldFilterRouteKey(routeKey),
						);
						sendResponse({ status: "ok", snapshot });
					} catch (err) {
						sendResponse({ status: "error", reason: String(err) });
					}
				})();
				return true; // keep message channel open for async sendResponse
			}
		};
		chrome.runtime.onMessage.addListener(this.messageListener);
	}
	private setupStorageListener(): void {
		this.storageListener = (
			changes: Record<string, { newValue?: unknown }>,
			area: string,
		) => {
			if (area !== SYNC_STORAGE_AREA) return;
			if ("enabled" in changes) {
				this.state.enabled = resolveEnabled(
					changes.enabled.newValue as boolean | undefined,
				);
				this.reconcile();
			}
			if (HIDE_RENDER_MODE_STORAGE_KEY in changes) {
				this.state.hideMode = resolveHideRenderMode(
					changes[HIDE_RENDER_MODE_STORAGE_KEY].newValue as string | undefined,
				);
			}
		};
		chrome.storage.onChanged.addListener(this.storageListener);
	}
}

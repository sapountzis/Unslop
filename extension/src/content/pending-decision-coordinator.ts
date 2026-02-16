import { BATCH_RESULT_TIMEOUT_MS } from "../lib/config";
import { ATTRIBUTES } from "../lib/selectors";
import { Decision, Source } from "../types";

type DecisionResult = {
	decision: Decision;
	source: Source;
};

type TimerId = ReturnType<typeof globalThis.setTimeout>;
type PendingStatus = "pending" | "timed_out" | "completed" | "disposed";

type ViewportEntry = {
	target: HTMLElement;
	isIntersecting: boolean;
};

type ViewportObserver = {
	observe: (element: HTMLElement) => void;
	unobserve: (element: HTMLElement) => void;
	disconnect: () => void;
};

type PendingEntry = {
	postId: string;
	identity: string;
	renderRoot: HTMLElement;
	isStillCurrent: () => boolean;
	onLateHide: (result: DecisionResult) => void;
	resolveInitial: (result: DecisionResult) => void;
	initialPromise: Promise<DecisionResult>;
	initialSettled: boolean;
	status: PendingStatus;
	timer: TimerId | null;
};

export type PendingDecisionRegistration = {
	postId: string;
	identity: string;
	renderRoot: HTMLElement;
	classifyPromise: Promise<DecisionResult>;
	isStillCurrent: () => boolean;
	onLateHide: (result: DecisionResult) => void;
};

export type PendingDecisionHandle = {
	awaitInitialDecision: () => Promise<DecisionResult>;
	unregister: () => void;
};

type PendingDecisionCoordinatorOptions = {
	timeoutMs?: number;
	createObserver?: (
		onEntries: (entries: ViewportEntry[]) => void,
	) => ViewportObserver | null;
	isInViewport?: (element: HTMLElement) => boolean;
	setTimeout?: (handler: () => void, timeoutMs: number) => TimerId;
	clearTimeout?: (timeoutId: TimerId) => void;
};

export type PendingDecisionCoordinator = {
	register: (registration: PendingDecisionRegistration) => PendingDecisionHandle;
	clear: () => void;
	size: () => number;
};

function defaultIsInViewport(element: HTMLElement): boolean {
	if (!element.isConnected) return false;
	if (typeof element.getBoundingClientRect !== "function") return true;

	const rect = element.getBoundingClientRect();
	const viewportHeight =
		typeof window !== "undefined" ? window.innerHeight : Number.POSITIVE_INFINITY;
	const viewportWidth =
		typeof window !== "undefined" ? window.innerWidth : Number.POSITIVE_INFINITY;

	return (
		rect.bottom > 0 &&
		rect.right > 0 &&
		rect.top < viewportHeight &&
		rect.left < viewportWidth
	);
}

function defaultCreateObserver(
	onEntries: (entries: ViewportEntry[]) => void,
): ViewportObserver | null {
	if (typeof globalThis.IntersectionObserver !== "function") {
		return null;
	}

	const observer = new globalThis.IntersectionObserver((entries) => {
		const mapped: ViewportEntry[] = entries.map((entry) => ({
			target: entry.target as HTMLElement,
			isIntersecting: entry.isIntersecting,
		}));
		onEntries(mapped);
	});

	return {
		observe: (element) => observer.observe(element),
		unobserve: (element) => observer.unobserve(element),
		disconnect: () => observer.disconnect(),
	};
}

export function createPendingDecisionCoordinator(
	options: PendingDecisionCoordinatorOptions = {},
): PendingDecisionCoordinator {
	const timeoutMs = options.timeoutMs ?? BATCH_RESULT_TIMEOUT_MS;
	const isInViewport = options.isInViewport ?? defaultIsInViewport;
	const setTimer =
		options.setTimeout ??
		((handler: () => void, ms: number) => globalThis.setTimeout(handler, ms));
	const clearTimer =
		options.clearTimeout ??
		((timeoutId: TimerId) => globalThis.clearTimeout(timeoutId));
	const createObserver = options.createObserver ?? defaultCreateObserver;

	const byPostId = new Map<string, PendingEntry>();
	const postIdsByRoot = new Map<HTMLElement, Set<string>>();

	let observer: ViewportObserver | null = null;
	let observerInitialized = false;

	function resolveInitial(entry: PendingEntry, result: DecisionResult): void {
		if (entry.initialSettled) return;
		entry.initialSettled = true;
		entry.resolveInitial(result);
	}

	function clearEntryTimer(entry: PendingEntry): void {
		if (entry.timer === null) return;
		clearTimer(entry.timer);
		entry.timer = null;
	}

	function ensureObserver(): ViewportObserver | null {
		if (observerInitialized) return observer;
		observerInitialized = true;
		observer = createObserver((entries) => {
			for (const viewportEntry of entries) {
				if (!viewportEntry.isIntersecting) continue;
				const postIds = postIdsByRoot.get(viewportEntry.target);
				if (!postIds || postIds.size === 0) continue;

				for (const postId of postIds) {
					const pending = byPostId.get(postId);
					if (!pending || pending.status !== "pending") continue;
					startTimeout(pending);
				}
			}
		});

		return observer;
	}

	function observeEntry(entry: PendingEntry): void {
		let postIds = postIdsByRoot.get(entry.renderRoot);
		if (!postIds) {
			postIds = new Set<string>();
			postIdsByRoot.set(entry.renderRoot, postIds);
			ensureObserver()?.observe(entry.renderRoot);
		}
		postIds.add(entry.postId);
	}

	function unobserveEntry(entry: PendingEntry): void {
		const postIds = postIdsByRoot.get(entry.renderRoot);
		if (!postIds) return;
		postIds.delete(entry.postId);
		if (postIds.size > 0) return;

		postIdsByRoot.delete(entry.renderRoot);
		observer?.unobserve(entry.renderRoot);
	}

	function releaseEntry(entry: PendingEntry): void {
		clearEntryTimer(entry);
		unobserveEntry(entry);
		byPostId.delete(entry.postId);
	}

	function startTimeout(entry: PendingEntry): void {
		if (entry.status !== "pending") return;
		if (entry.timer !== null) return;

		entry.timer = setTimer(() => {
			if (entry.status !== "pending") return;
			entry.status = "timed_out";
			entry.timer = null;
			resolveInitial(entry, { decision: "keep", source: "error" });
		}, timeoutMs);
	}

	function handleClassificationResult(
		entry: PendingEntry,
		result: DecisionResult,
	): void {
		if (entry.status === "disposed" || entry.status === "completed") return;

		if (entry.status === "pending") {
			entry.status = "completed";
			resolveInitial(entry, result);
			releaseEntry(entry);
			return;
		}

		// Timed out locally; only apply late hide when identity is still current.
		if (
			entry.status === "timed_out" &&
			result.decision === "hide" &&
			entry.renderRoot.isConnected &&
			entry.renderRoot.getAttribute(ATTRIBUTES.identity) === entry.identity &&
			entry.isStillCurrent()
		) {
			entry.onLateHide(result);
		}

		entry.status = "completed";
		releaseEntry(entry);
	}

	function unregisterEntry(entry: PendingEntry): void {
		const current = byPostId.get(entry.postId);
		if (current !== entry) return;

		if (entry.status === "pending") {
			resolveInitial(entry, { decision: "keep", source: "error" });
		}

		entry.status = "disposed";
		releaseEntry(entry);
	}

	function toHandle(entry: PendingEntry): PendingDecisionHandle {
		return {
			awaitInitialDecision: () => entry.initialPromise,
			unregister: () => unregisterEntry(entry),
		};
	}

	return {
		register(registration: PendingDecisionRegistration): PendingDecisionHandle {
			const existing = byPostId.get(registration.postId);
			if (existing) {
				if (
					existing.identity !== registration.identity ||
					existing.renderRoot !== registration.renderRoot
				) {
					unregisterEntry(existing);
				} else {
					return toHandle(existing);
				}
			}

			let resolve!: (result: DecisionResult) => void;
			const initialPromise = new Promise<DecisionResult>((resolver) => {
				resolve = resolver;
			});

			const entry: PendingEntry = {
				postId: registration.postId,
				identity: registration.identity,
				renderRoot: registration.renderRoot,
				isStillCurrent: registration.isStillCurrent,
				onLateHide: registration.onLateHide,
				resolveInitial: resolve,
				initialPromise,
				initialSettled: false,
				status: "pending",
				timer: null,
			};

			byPostId.set(registration.postId, entry);
			observeEntry(entry);

			if (isInViewport(registration.renderRoot)) {
				startTimeout(entry);
			}

			void registration.classifyPromise
				.then((result) => {
					handleClassificationResult(entry, result);
				})
				.catch(() => {
					handleClassificationResult(entry, {
						decision: "keep",
						source: "error",
					});
				});

			return toHandle(entry);
		},
		clear(): void {
			for (const entry of [...byPostId.values()]) {
				unregisterEntry(entry);
			}
			postIdsByRoot.clear();
			observer?.disconnect();
			observer = null;
			observerInitialized = false;
		},
		size(): number {
			return byPostId.size;
		},
	};
}

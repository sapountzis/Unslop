import { Decision } from "../types";
import { HideRenderMode } from "../lib/config";
import { VisibilityIndex } from "./visibility-index";

const POSITION_PRECEDING =
	typeof Node === "undefined" ? 2 : Node.DOCUMENT_POSITION_PRECEDING;
const POSITION_FOLLOWING =
	typeof Node === "undefined" ? 4 : Node.DOCUMENT_POSITION_FOLLOWING;
const FALLBACK_RAF_INTERVAL_MS = 16;
const HIDE_DECISION: Decision = "hide";
const COLLAPSE_HIDE_MODE: HideRenderMode = "collapse";

type RenderFinalizeStatus = "applied" | "discarded";
const RENDER_FINALIZE_APPLIED: RenderFinalizeStatus = "applied";
const RENDER_FINALIZE_DISCARDED: RenderFinalizeStatus = "discarded";

export type RenderCommitEntry = {
	renderRoot: HTMLElement;
	labelRoot?: HTMLElement;
	decision: Decision;
	postId?: string;
	hideMode: HideRenderMode;
	isStillValid?: (context: {
		renderRoot: HTMLElement;
		decision: Decision;
		postId?: string;
	}) => boolean;
	onFinalized?: (status: RenderFinalizeStatus) => void;
};

type InternalEntry = RenderCommitEntry;

type RenderCommitPipelineOptions = {
	render: (
		element: HTMLElement,
		decision: Decision,
		postId?: string,
		options?: { hideMode?: HideRenderMode },
	) => void;
	visibility: VisibilityIndex;
	isWithinCommitBand?: (element: HTMLElement) => boolean;
	requestAnimationFrame?: (cb: FrameRequestCallback) => number;
	cancelAnimationFrame?: (id: number) => void;
};

const DEFAULT_COMMIT_BAND_PX = 240;

let fallbackFrameId = 0;
const fallbackFrameTimers = new Map<
	number,
	ReturnType<typeof globalThis.setTimeout>
>();

function fallbackRequestAnimationFrame(cb: FrameRequestCallback): number {
	fallbackFrameId += 1;
	const frameId = fallbackFrameId;
	const timer = globalThis.setTimeout(() => {
		fallbackFrameTimers.delete(frameId);
		cb(Date.now());
	}, FALLBACK_RAF_INTERVAL_MS);
	fallbackFrameTimers.set(frameId, timer);
	return frameId;
}

function fallbackCancelAnimationFrame(id: number): void {
	const timer = fallbackFrameTimers.get(id);
	if (!timer) return;
	globalThis.clearTimeout(timer);
	fallbackFrameTimers.delete(id);
}

function compareDomOrder(a: HTMLElement, b: HTMLElement): number {
	if (a === b) return 0;
	if (typeof a.compareDocumentPosition !== "function") return 0;
	const position = a.compareDocumentPosition(b);
	if ((position & POSITION_FOLLOWING) !== 0) return -1;
	if ((position & POSITION_PRECEDING) !== 0) return 1;
	return 0;
}

function isCollapseHideDecision(
	entry: Pick<InternalEntry, "decision" | "hideMode">,
): boolean {
	return (
		entry.decision === HIDE_DECISION && entry.hideMode === COLLAPSE_HIDE_MODE
	);
}

function shouldDeferDestructiveHide(
	entry: InternalEntry,
	visibility: VisibilityIndex,
): boolean {
	if (!isCollapseHideDecision(entry)) return false;
	if (!visibility.hasSnapshot(entry.renderRoot)) return true;
	return visibility.isCurrentlyVisible(entry.renderRoot);
}

function defaultIsWithinCommitBand(element: HTMLElement): boolean {
	if (typeof window === "undefined") return true;
	if (typeof element.getBoundingClientRect !== "function") return true;

	const rect = element.getBoundingClientRect();
	const viewportHeight =
		window.innerHeight ||
		(typeof document !== "undefined"
			? (document.documentElement?.clientHeight ?? 0)
			: 0);

	if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return true;

	const bandTop = 0 - DEFAULT_COMMIT_BAND_PX;
	const bandBottom = viewportHeight + DEFAULT_COMMIT_BAND_PX;
	return rect.bottom >= bandTop && rect.top <= bandBottom;
}

export function createRenderCommitPipeline(
	options: RenderCommitPipelineOptions,
) {
	const requestAnimationFrame =
		options.requestAnimationFrame ??
		(typeof window.requestAnimationFrame === "function"
			? window.requestAnimationFrame.bind(window)
			: fallbackRequestAnimationFrame);
	const cancelAnimationFrame =
		options.cancelAnimationFrame ??
		(typeof window.cancelAnimationFrame === "function"
			? window.cancelAnimationFrame.bind(window)
			: fallbackCancelAnimationFrame);
	const isWithinCommitBand =
		options.isWithinCommitBand ?? defaultIsWithinCommitBand;

	const pending = new Map<HTMLElement, InternalEntry>();
	let frameHandle = 0;

	function finalize(entry: InternalEntry, status: RenderFinalizeStatus): void {
		entry.onFinalized?.(status);
	}

	function scheduleFlush(): void {
		if (frameHandle !== 0) return;
		frameHandle = requestAnimationFrame(() => {
			frameHandle = 0;
			flushNow();
		});
	}

	function shouldDiscard(entry: InternalEntry): boolean {
		if (entry.renderRoot.isConnected === false) return true;
		if (!entry.isStillValid) return false;

		return !entry.isStillValid({
			renderRoot: entry.renderRoot,
			decision: entry.decision,
			postId: entry.postId,
		});
	}

	function shouldDefer(entry: InternalEntry): boolean {
		if (shouldDeferDestructiveHide(entry, options.visibility)) {
			return true;
		}

		if (
			isCollapseHideDecision(entry) &&
			!isWithinCommitBand(entry.renderRoot)
		) {
			return true;
		}

		return false;
	}

	function flushNow(): void {
		if (pending.size === 0) return;

		const entries = [...pending.values()].sort((a, b) =>
			compareDomOrder(a.renderRoot, b.renderRoot),
		);
		pending.clear();

		for (const entry of entries) {
			if (shouldDiscard(entry)) {
				finalize(entry, RENDER_FINALIZE_DISCARDED);
				continue;
			}

			if (shouldDefer(entry)) {
				pending.set(entry.renderRoot, entry);
				continue;
			}

			const renderTarget = entry.labelRoot ?? entry.renderRoot;
			options.render(renderTarget, entry.decision, entry.postId, {
				hideMode: entry.hideMode,
			});
			finalize(entry, RENDER_FINALIZE_APPLIED);
		}
	}

	return {
		enqueue(entry: RenderCommitEntry): void {
			pending.set(entry.renderRoot, entry);
			scheduleFlush();
		},
		requestFlush(): void {
			if (pending.size === 0) return;
			scheduleFlush();
		},
		flushNow,
		clear(): void {
			if (frameHandle !== 0) {
				cancelAnimationFrame(frameHandle);
				frameHandle = 0;
			}

			for (const entry of pending.values()) {
				finalize(entry, RENDER_FINALIZE_DISCARDED);
			}
			pending.clear();
		},
		size(): number {
			return pending.size;
		},
		actionableSize(): number {
			let count = 0;
			for (const entry of pending.values()) {
				if (shouldDiscard(entry)) continue;
				if (shouldDefer(entry)) continue;
				count += 1;
			}
			return count;
		},
	};
}

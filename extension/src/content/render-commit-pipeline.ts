import { Decision } from "../types";
import { HideRenderMode } from "../lib/config";

const POSITION_PRECEDING =
	typeof Node === "undefined" ? 2 : Node.DOCUMENT_POSITION_PRECEDING;
const POSITION_FOLLOWING =
	typeof Node === "undefined" ? 4 : Node.DOCUMENT_POSITION_FOLLOWING;
const FALLBACK_RAF_INTERVAL_MS = 16;

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
	requestAnimationFrame?: (cb: FrameRequestCallback) => number;
	cancelAnimationFrame?: (id: number) => void;
};

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
				count += 1;
			}
			return count;
		},
	};
}

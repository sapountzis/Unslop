import { describe, expect, it } from "bun:test";
import { createPendingDecisionCoordinator } from "./pending-decision-coordinator";
import { ATTRIBUTES } from "../lib/selectors";

type DecisionResult = {
	decision: "keep" | "hide";
	source: "llm" | "cache" | "error";
};

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});
	return { promise, resolve };
}

function createManualClock() {
	let now = 0;
	let nextId = 1;
	const timers = new Map<number, { dueAt: number; handler: () => void }>();

	return {
		setTimeout(handler: () => void, timeoutMs: number) {
			const id = nextId;
			nextId += 1;
			timers.set(id, { dueAt: now + timeoutMs, handler });
			return id as unknown as ReturnType<typeof globalThis.setTimeout>;
		},
		clearTimeout(timeoutId: ReturnType<typeof globalThis.setTimeout>) {
			timers.delete(timeoutId as unknown as number);
		},
		advance(ms: number): void {
			now += ms;
			while (true) {
				const due = [...timers.entries()]
					.filter(([, timer]) => timer.dueAt <= now)
					.sort((a, b) => a[1].dueAt - b[1].dueAt);
				if (due.length === 0) return;
				for (const [id, timer] of due) {
					timers.delete(id);
					timer.handler();
				}
			}
		},
	};
}

function createObserverHarness() {
	type ObserverCallback = (
		entries: Array<{ target: HTMLElement; isIntersecting: boolean }>,
	) => void;

	let callback: ObserverCallback | null = null;

	return {
		createObserver(onEntries: ObserverCallback) {
			callback = onEntries;
			return {
				observe: (_element: HTMLElement) => undefined,
				unobserve: (_element: HTMLElement) => undefined,
				disconnect: () => undefined,
			};
		},
		emit(target: HTMLElement, isIntersecting: boolean): void {
			if (!callback) return;
			callback([{ target, isIntersecting }]);
		},
	};
}

function createMockElement(
	visible: boolean,
	identity: string,
): HTMLElement & { visible: boolean } {
	const attributes = new Map<string, string>([[ATTRIBUTES.identity, identity]]);

	return {
		visible,
		isConnected: true,
		getAttribute: (name: string) => attributes.get(name) ?? null,
		setAttribute: (name: string, value: string) => {
			attributes.set(name, value);
		},
	} as HTMLElement & { visible: boolean };
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("runtime timeout regressions", () => {
	it("fast-scroll backlog fail-open does not permanently keep posts that later resolve hide", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(false, "identity-1");

		const appliedDecisions: Array<"keep" | "hide"> = [];

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "post-1",
			identity: "identity-1",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: (result) => appliedDecisions.push(result.decision),
		});

		void handle.awaitInitialDecision().then((result) => {
			appliedDecisions.push(result.decision);
		});

		clock.advance(2000);
		await flushMicrotasks();
		expect(appliedDecisions).toEqual([]);

		renderRoot.visible = true;
		observer.emit(renderRoot, true);
		clock.advance(3000);
		await flushMicrotasks();
		expect(appliedDecisions).toEqual(["keep"]);

		deferred.resolve({ decision: "hide", source: "llm" });
		await flushMicrotasks();
		expect(appliedDecisions).toEqual(["keep", "hide"]);
	});
});

import { describe, expect, it } from "bun:test";
import { createPendingDecisionCoordinator } from "./pending-decision-coordinator";
import { ATTRIBUTES } from "../lib/selectors";

type DecisionResult = {
	decision: "keep" | "hide";
	source: "llm" | "cache" | "error";
};

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolver, rejecter) => {
		resolve = resolver;
		reject = rejecter;
	});
	return { promise, resolve, reject };
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

describe("pending decision coordinator", () => {
	it("fires fail-open at 3s for in-view pending posts", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(true, "id-1");

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p1",
			identity: "id-1",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: () => undefined,
		});

		let result: DecisionResult | null = null;
		void handle.awaitInitialDecision().then((value) => {
			result = value;
		});

		clock.advance(2999);
		await flushMicrotasks();
		expect(result).toBeNull();

		clock.advance(1);
		await flushMicrotasks();
		expect(result).toEqual({ decision: "keep", source: "error" });
	});

	it("does not fail-open while pending post is offscreen", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(false, "id-2");

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p2",
			identity: "id-2",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: () => undefined,
		});

		let result: DecisionResult | null = null;
		void handle.awaitInitialDecision().then((value) => {
			result = value;
		});

		clock.advance(5000);
		await flushMicrotasks();
		expect(result).toBeNull();

		handle.unregister();
		await flushMicrotasks();
		expect(result).toEqual({ decision: "keep", source: "error" });
	});

	it("starts timeout when an offscreen pending post enters the viewport", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(false, "id-3");

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p3",
			identity: "id-3",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: () => undefined,
		});

		let result: DecisionResult | null = null;
		void handle.awaitInitialDecision().then((value) => {
			result = value;
		});

		clock.advance(5000);
		await flushMicrotasks();
		expect(result).toBeNull();

		renderRoot.visible = true;
		observer.emit(renderRoot, true);

		clock.advance(2999);
		await flushMicrotasks();
		expect(result).toBeNull();

		clock.advance(1);
		await flushMicrotasks();
		expect(result).toEqual({ decision: "keep", source: "error" });
	});

	it("applies late hide after timeout when identity is still current", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(true, "id-4");
		const lateHide: DecisionResult[] = [];

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p4",
			identity: "id-4",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: (result) => lateHide.push(result),
		});

		let initial: DecisionResult | null = null;
		void handle.awaitInitialDecision().then((value) => {
			initial = value;
		});

		clock.advance(3000);
		await flushMicrotasks();
		expect(initial).toEqual({ decision: "keep", source: "error" });

		deferred.resolve({ decision: "hide", source: "llm" });
		await flushMicrotasks();
		expect(lateHide).toEqual([{ decision: "hide", source: "llm" }]);
	});

	it("does nothing for late keep after timeout", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(true, "id-5");
		const lateHide: DecisionResult[] = [];

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p5",
			identity: "id-5",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => true,
			onLateHide: (result) => lateHide.push(result),
		});

		void handle.awaitInitialDecision();
		clock.advance(3000);
		await flushMicrotasks();

		deferred.resolve({ decision: "keep", source: "llm" });
		await flushMicrotasks();
		expect(lateHide).toEqual([]);
	});

	it("ignores late hide when identity no longer matches", async () => {
		const clock = createManualClock();
		const observer = createObserverHarness();
		const deferred = createDeferred<DecisionResult>();
		const renderRoot = createMockElement(true, "id-6");
		const lateHide: DecisionResult[] = [];

		const coordinator = createPendingDecisionCoordinator({
			timeoutMs: 3000,
			createObserver: observer.createObserver,
			isInViewport: (element) => (element as { visible?: boolean }).visible === true,
			setTimeout: clock.setTimeout,
			clearTimeout: clock.clearTimeout,
		});

		const handle = coordinator.register({
			postId: "p6",
			identity: "id-6",
			renderRoot,
			classifyPromise: deferred.promise,
			isStillCurrent: () => false,
			onLateHide: (result) => lateHide.push(result),
		});

		void handle.awaitInitialDecision();
		clock.advance(3000);
		await flushMicrotasks();

		deferred.resolve({ decision: "hide", source: "llm" });
		await flushMicrotasks();
		expect(lateHide).toEqual([]);
	});
});

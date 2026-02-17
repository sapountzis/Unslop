import { describe, expect, it } from "bun:test";
import { createWindowedBatcher } from "./windowed-batcher";

type FakeTimer = {
	id: number;
	handler: () => void;
};

function createTimerHarness() {
	let nextId = 1;
	const timers = new Map<number, FakeTimer>();

	return {
		setTimer(handler: () => void): ReturnType<typeof globalThis.setTimeout> {
			const id = nextId++;
			timers.set(id, { id, handler });
			return id as ReturnType<typeof globalThis.setTimeout>;
		},
		clearTimer(handle: ReturnType<typeof globalThis.setTimeout>): void {
			timers.delete(Number(handle));
		},
		fireNext(): void {
			const [entry] = timers.values();
			if (!entry) return;
			timers.delete(entry.id);
			entry.handler();
		},
		timerCount(): number {
			return timers.size;
		},
	};
}

describe("createWindowedBatcher", () => {
	it("flushes immediately when max items is reached", () => {
		const flushed: number[][] = [];
		const batcher = createWindowedBatcher<number>({
			maxItems: 2,
			maxWaitMs: 50,
			onFlush: (batch) => flushed.push(batch),
		});

		batcher.push(1);
		batcher.push(2);

		expect(flushed).toEqual([[1, 2]]);
		expect(batcher.size()).toBe(0);
	});

	it("flushes on timer when batch is smaller than max", () => {
		const timers = createTimerHarness();
		const flushed: number[][] = [];
		const batcher = createWindowedBatcher<number>({
			maxItems: 3,
			maxWaitMs: 25,
			onFlush: (batch) => flushed.push(batch),
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});

		batcher.push(1);
		batcher.push(2);
		expect(flushed).toEqual([]);
		expect(timers.timerCount()).toBe(1);

		timers.fireNext();
		expect(flushed).toEqual([[1, 2]]);
		expect(batcher.size()).toBe(0);
	});

	it("flushes remaining items when closed", () => {
		const flushed: number[][] = [];
		const batcher = createWindowedBatcher<number>({
			maxItems: 10,
			maxWaitMs: 100,
			onFlush: (batch) => flushed.push(batch),
		});

		batcher.push(7);
		batcher.push(8);
		batcher.close();

		expect(flushed).toEqual([[7, 8]]);
		expect(batcher.size()).toBe(0);
	});
});

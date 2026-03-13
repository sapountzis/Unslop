type TimerHandle = Parameters<typeof globalThis.clearTimeout>[0];

export type WindowedBatcherOptions<T> = {
	maxItems: number;
	maxWaitMs: number;
	onFlush: (batch: T[]) => void;
	setTimer?: (handler: () => void, timeoutMs: number) => TimerHandle;
	clearTimer?: (handle: TimerHandle) => void;
};

export type WindowedBatcher<T> = {
	push(item: T): void;
	flush(): void;
	close(): void;
	size(): number;
};

export function createWindowedBatcher<T>(
	options: WindowedBatcherOptions<T>,
): WindowedBatcher<T> {
	const maxItems = Math.max(1, Math.floor(options.maxItems));
	const maxWaitMs = Math.max(0, Math.floor(options.maxWaitMs));
	const setTimer = options.setTimer ?? globalThis.setTimeout;
	const clearTimer = options.clearTimer ?? globalThis.clearTimeout;

	const queue: T[] = [];
	let timer: TimerHandle | null = null;

	function clearFlushTimer(): void {
		if (timer === null) {
			return;
		}
		clearTimer(timer);
		timer = null;
	}

	function scheduleFlushTimer(): void {
		if (timer !== null || queue.length === 0) {
			return;
		}

		timer = setTimer(() => {
			timer = null;
			flush();
		}, maxWaitMs);
	}

	function flush(): void {
		clearFlushTimer();
		if (queue.length === 0) {
			return;
		}

		const batch = queue.splice(0, queue.length);
		options.onFlush(batch);
	}

	return {
		push(item: T): void {
			queue.push(item);
			if (queue.length >= maxItems) {
				flush();
				return;
			}
			scheduleFlushTimer();
		},
		flush,
		close(): void {
			flush();
			clearFlushTimer();
		},
		size(): number {
			return queue.length;
		},
	};
}

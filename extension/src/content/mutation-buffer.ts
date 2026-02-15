export function createMutationBuffer(onProcess: (el: HTMLElement) => void) {
	const pending = new Set<HTMLElement>();

	return {
		enqueue(el: HTMLElement): void {
			pending.add(el);
		},
		drain(maxItems: number): number {
			if (maxItems <= 0) return 0;

			let processed = 0;
			for (const el of pending) {
				pending.delete(el);
				onProcess(el);
				processed += 1;
				if (processed >= maxItems) break;
			}
			return processed;
		},
		flushNow(): void {
			for (const el of pending) {
				onProcess(el);
			}
			pending.clear();
		},
		size(): number {
			return pending.size;
		},
		clear(): void {
			pending.clear();
		},
	};
}

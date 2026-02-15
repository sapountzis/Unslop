export type VisibilityIndex = {
	observe: (element: HTMLElement) => void;
	unobserve: (element: HTMLElement) => void;
	hasSnapshot: (element: HTMLElement) => boolean;
	isCurrentlyVisible: (element: HTMLElement) => boolean;
	clear: () => void;
	size: () => number;
};

export type VisibilityIndexOptions = {
	rootMargin?: string;
	threshold?: number;
	onVisibilityChange?: () => void;
	createObserver?: (
		callback: IntersectionObserverCallback,
		options: IntersectionObserverInit,
	) => Pick<IntersectionObserver, "observe" | "unobserve" | "disconnect">;
};

type VisibilityState = {
	seen: boolean;
	current: boolean;
};

const DEFAULT_ROOT_MARGIN = "24px 0px 24px 0px";
const DEFAULT_THRESHOLD = 0.01;

function createFallbackVisibilityIndex(): VisibilityIndex {
	const observed = new Set<HTMLElement>();

	return {
		observe(element) {
			observed.add(element);
		},
		unobserve(element) {
			observed.delete(element);
		},
		hasSnapshot(element) {
			return observed.has(element);
		},
		isCurrentlyVisible(element) {
			return observed.has(element);
		},
		clear() {
			observed.clear();
		},
		size() {
			return observed.size;
		},
	};
}

function getObserverFactory(
	createObserver: VisibilityIndexOptions["createObserver"],
): VisibilityIndexOptions["createObserver"] | null {
	if (createObserver) {
		return createObserver;
	}

	if (typeof globalThis.IntersectionObserver !== "function") {
		return null;
	}

	return (callback, options) =>
		new globalThis.IntersectionObserver(callback, options);
}

export function createVisibilityIndex(
	options?: VisibilityIndexOptions,
): VisibilityIndex {
	const observerFactory = getObserverFactory(options?.createObserver);
	if (!observerFactory) {
		return createFallbackVisibilityIndex();
	}

	const states = new Map<HTMLElement, VisibilityState>();
	const observer = observerFactory(
		(entries) => {
			let changed = false;

			for (const entry of entries) {
				if (!(entry.target instanceof HTMLElement)) continue;
				const previous = states.get(entry.target);
				if (!previous) continue;

				const seen = true;
				const current = entry.isIntersecting;
				if (previous.seen === seen && previous.current === current) continue;

				states.set(entry.target, { seen, current });
				changed = true;
			}

			if (changed) {
				options?.onVisibilityChange?.();
			}
		},
		{
			root: null,
			rootMargin: options?.rootMargin ?? DEFAULT_ROOT_MARGIN,
			threshold: options?.threshold ?? DEFAULT_THRESHOLD,
		},
	);

	return {
		observe(element) {
			if (states.has(element)) return;
			states.set(element, { seen: false, current: false });
			observer.observe(element);
		},
		unobserve(element) {
			if (!states.has(element)) return;
			states.delete(element);
			observer.unobserve(element);
		},
		hasSnapshot(element) {
			return states.get(element)?.seen ?? false;
		},
		isCurrentlyVisible(element) {
			return states.get(element)?.current ?? false;
		},
		clear() {
			states.clear();
			observer.disconnect();
		},
		size() {
			return states.size;
		},
	};
}

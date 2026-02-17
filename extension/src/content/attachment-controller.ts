type ObserverHandle = {
	disconnect: () => void;
};

type AttachFeedContext = {
	routeKey: string;
	generation: number;
	feedRoot: Element;
};

type AttachBodyContext = {
	routeKey: string;
	onFeedAvailable: () => void;
};

type AttachmentControllerOptions = {
	isRouteEligible: (routeKey: string) => boolean;
	findFeedRoot: () => Element | null;
	attachFeedObserver: (context: AttachFeedContext) => ObserverHandle;
	attachBodyObserver: (context: AttachBodyContext) => ObserverHandle;
};

export type AttachmentControllerState = {
	routeKey: string;
	generation: number;
	feedRootRef: Element | null;
	feedObserverActive: boolean;
	bodyObserverActive: boolean;
};

type EnsureAttachedInput = {
	routeKey: string;
	force?: boolean;
};

function isConnected(root: Element | null): boolean {
	if (!root) return false;
	return typeof root.isConnected === "boolean" ? root.isConnected : true;
}

export function createAttachmentController(
	options: AttachmentControllerOptions,
) {
	let feedObserver: ObserverHandle | null = null;
	let bodyObserver: ObserverHandle | null = null;
	let generation = 0;
	let generationAttached = false;
	let state: AttachmentControllerState = {
		routeKey: "",
		generation: 0,
		feedRootRef: null,
		feedObserverActive: false,
		bodyObserverActive: false,
	};

	function disconnectFeedObserver(): void {
		if (!feedObserver) return;
		feedObserver.disconnect();
		feedObserver = null;
		state.feedObserverActive = false;
		state.feedRootRef = null;
	}

	function disconnectBodyObserver(): void {
		if (!bodyObserver) return;
		bodyObserver.disconnect();
		bodyObserver = null;
		state.bodyObserverActive = false;
	}

	function detachAll(): void {
		disconnectFeedObserver();
		disconnectBodyObserver();
		generationAttached = false;
		state.generation = generation;
	}

	function isLive(routeKey = state.routeKey): boolean {
		if (!options.isRouteEligible(routeKey)) return false;

		const feedLive =
			state.feedObserverActive &&
			!!state.feedRootRef &&
			isConnected(state.feedRootRef);
		if (feedLive) return true;

		return state.bodyObserverActive;
	}

	function attachFeed(routeKey: string, feedRoot: Element): void {
		disconnectFeedObserver();
		disconnectBodyObserver();

		generation += 1;
		generationAttached = true;
		state.routeKey = routeKey;
		state.generation = generation;
		state.feedRootRef = feedRoot;

		feedObserver = options.attachFeedObserver({
			routeKey,
			generation,
			feedRoot,
		});
		state.feedObserverActive = true;
		state.bodyObserverActive = false;
	}

	function attachBody(routeKey: string): void {
		disconnectFeedObserver();
		disconnectBodyObserver();

		generationAttached = false;
		state.generation = generation;
		state.routeKey = routeKey;
		state.feedRootRef = null;

		bodyObserver = options.attachBodyObserver({
			routeKey,
			onFeedAvailable: () => {
				void ensureAttached({ routeKey });
			},
		});
		state.bodyObserverActive = true;
	}

	function ensureAttached(input: EnsureAttachedInput): void {
		const routeKey = input.routeKey;
		const force = input.force ?? false;
		const previousRoute = state.routeKey;

		state.routeKey = routeKey;

		if (!options.isRouteEligible(routeKey)) {
			detachAll();
			return;
		}

		const feedRoot = options.findFeedRoot();
		const routeChanged = previousRoute !== routeKey;
		const live = isLive(routeKey);

		if (feedRoot) {
			const hasSameLiveRoot =
				!routeChanged &&
				!force &&
				state.feedObserverActive &&
				state.feedRootRef === feedRoot &&
				isConnected(state.feedRootRef);

			if (hasSameLiveRoot) {
				return;
			}

			attachFeed(routeKey, feedRoot);
			return;
		}

		const canKeepWaiting =
			!routeChanged &&
			!force &&
			!state.feedObserverActive &&
			state.bodyObserverActive &&
			live;

		if (canKeepWaiting) {
			return;
		}

		attachBody(routeKey);
	}

	return {
		ensureAttached,
		detachAll,
		isLive,
		isCurrentGeneration: (candidateGeneration: number): boolean =>
			generationAttached && candidateGeneration === generation,
		getState(): AttachmentControllerState {
			return { ...state };
		},
	};
}

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";
import type { PlatformPlugin } from "../platforms/platform";
import type { PostData } from "../types";
import { Pipeline } from "./pipeline";
import { ROUTE_HEARTBEAT_MS } from "../lib/config";

type ChromeMock = {
	runtime: {
		sendMessage: ReturnType<typeof mock>;
		onMessage: {
			addListener: ReturnType<typeof mock>;
			removeListener: ReturnType<typeof mock>;
		};
	};
	storage: {
		sync: {
			get: ReturnType<typeof mock>;
			set: ReturnType<typeof mock>;
		};
		local: {
			get: ReturnType<typeof mock>;
			set: ReturnType<typeof mock>;
		};
		onChanged: {
			addListener: ReturnType<typeof mock>;
			removeListener: ReturnType<typeof mock>;
		};
	};
};

const activePipelines = new Set<Pipeline>();

function installChromeMock(): void {
	const chromeMock: ChromeMock = {
		runtime: {
			sendMessage: mock(async () => ({ status: "ok" as const })),
			onMessage: {
				addListener: mock(() => {}),
				removeListener: mock(() => {}),
			},
		},
		storage: {
			sync: {
				get: mock(async () => ({})),
				set: mock(async () => {}),
			},
			local: {
				get: mock(async () => ({ decisionCache: {} })),
				set: mock(async () => {}),
			},
			onChanged: {
				addListener: mock(() => {}),
				removeListener: mock(() => {}),
			},
		},
	};
	(globalThis as unknown as { chrome: ChromeMock }).chrome = chromeMock;
}

type RouteState = {
	get: () => string;
	set: (path: string) => void;
};

function normalizeRouteKey(path: string): string {
	const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
	return withLeadingSlash.endsWith("/")
		? withLeadingSlash
		: `${withLeadingSlash}/`;
}

function createRouteState(initialPath: string): RouteState {
	let routeKey = normalizeRouteKey(initialPath);
	return {
		get: () => routeKey,
		set: (path: string) => {
			routeKey = normalizeRouteKey(path);
		},
	};
}

function makePost(id: string): HTMLElement {
	const post = document.createElement("article");
	post.setAttribute("data-test-post", "true");
	post.setAttribute("data-post-id", id);
	post.textContent = `post ${id}`;
	return post;
}

function createPlugin(
	extractCounter: { value: number },
	routeState: RouteState,
): PlatformPlugin {
	return {
		id: "linkedin",
		detectionProfile: {
			hintSelectors: ["[data-test-post]"],
			maxAncestorDepth: 1,
			minScore: 1,
			fallbackRejectStreak: 1,
			signals: [
				{
					id: "test_post_marker",
					weight: 1,
					test: (element) => element.hasAttribute("data-test-post"),
				},
			],
			resolveContentRoot: (candidateRoot) =>
				candidateRoot.hasAttribute("data-test-post") ? candidateRoot : null,
		},
		routeKeyFromUrl: () => routeState.get(),
		shouldFilterRouteKey(routeKey) {
			return routeKey === "/feed/" || routeKey.startsWith("/feed/");
		},
		findFeedRoot() {
			const routeKey = routeState.get();
			return this.shouldFilterRouteKey(routeKey) ? document.body : null;
		},
		async extractPostData(element): Promise<PostData | null> {
			extractCounter.value += 1;
			const postId = element.getAttribute("data-post-id") ?? "missing";
			return {
				post_id: postId,
				text: `post ${postId}`,
				attachments: [],
			};
		},
		readPostIdentity(element) {
			return element.getAttribute("data-post-id");
		},
	};
}

function createPipeline(
	extractCounter: { value: number },
	routeState: RouteState,
): Pipeline {
	const pipeline = new Pipeline(createPlugin(extractCounter, routeState));
	activePipelines.add(pipeline);
	return pipeline;
}

async function drain(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	jest.useFakeTimers();
	installChromeMock();
	document.body.innerHTML = "";
});

afterEach(() => {
	for (const pipeline of activePipelines) {
		pipeline.stop();
	}
	activePipelines.clear();
	jest.clearAllTimers();
	jest.useRealTimers();
	delete (globalThis as unknown as { chrome?: ChromeMock }).chrome;
	document.body.innerHTML = "";
});

describe("Pipeline route heartbeat", () => {
	it("recovers when moving from notifications to feed", async () => {
		const routeState = createRouteState("/notifications/");
		const extractCounter = { value: 0 };
		const pipeline = createPipeline(extractCounter, routeState);

		document.body.appendChild(makePost("1"));
		await pipeline.start();

		expect(extractCounter.value).toBe(0);

		routeState.set("/feed/");
		jest.advanceTimersByTime(ROUTE_HEARTBEAT_MS);
		await drain();

		expect(extractCounter.value).toBe(1);
		pipeline.stop();
	});

	it("does not rescan repeatedly when route stays stable", async () => {
		const routeState = createRouteState("/feed/");
		const extractCounter = { value: 0 };
		const pipeline = createPipeline(extractCounter, routeState);

		document.body.appendChild(makePost("1"));
		await pipeline.start();
		await drain();

		expect(extractCounter.value).toBe(1);

		jest.advanceTimersByTime(ROUTE_HEARTBEAT_MS * 6);
		await drain();

		expect(extractCounter.value).toBe(1);
		pipeline.stop();
	});

	it("suppresses processing on ineligible routes and resumes on eligible routes", async () => {
		const routeState = createRouteState("/notifications/");
		const extractCounter = { value: 0 };
		const pipeline = createPipeline(extractCounter, routeState);

		await pipeline.start();
		document.body.appendChild(makePost("2"));
		await drain();

		expect(extractCounter.value).toBe(0);

		routeState.set("/feed/");
		jest.advanceTimersByTime(ROUTE_HEARTBEAT_MS);
		await drain();

		expect(extractCounter.value).toBe(1);
		pipeline.stop();
	});

	it("stops route heartbeat after stop()", async () => {
		const routeState = createRouteState("/notifications/");
		const extractCounter = { value: 0 };
		const pipeline = createPipeline(extractCounter, routeState);

		document.body.appendChild(makePost("3"));
		await pipeline.start();
		pipeline.stop();

		routeState.set("/feed/");
		jest.advanceTimersByTime(ROUTE_HEARTBEAT_MS * 5);
		await drain();

		expect(extractCounter.value).toBe(0);
	});
});

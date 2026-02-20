// Observer — attaches a MutationObserver to the feed container.
//
// Two-phase: if the feed root isn't present yet, watches document.body
// until it appears, then switches to watching the feed root directly.

export class FeedObserver {
	private feedObserver: MutationObserver | null = null;
	private bodyObserver: MutationObserver | null = null;
	private attached = false;

	constructor(
		private readonly findFeedRoot: () => Element | null,
		private readonly onNodes: (nodes: Node[]) => void,
		private readonly onAttached?: () => void,
	) {}

	attach(): void {
		this.detach();
		const feedRoot = this.findFeedRoot();
		if (feedRoot) {
			this.attachFeed(feedRoot);
		} else {
			this.attachBody();
		}
	}

	detach(): void {
		this.feedObserver?.disconnect();
		this.bodyObserver?.disconnect();
		this.feedObserver = null;
		this.bodyObserver = null;
		this.attached = false;
	}

	get isLive(): boolean {
		return this.attached;
	}

	private attachFeed(feedRoot: Element): void {
		this.bodyObserver?.disconnect();
		this.bodyObserver = null;

		this.feedObserver = new MutationObserver((mutations) => {
			const nodes: Node[] = [];
			for (const m of mutations) {
				for (const node of m.addedNodes) nodes.push(node);
			}
			if (nodes.length > 0) this.onNodes(nodes);
		});
		this.feedObserver.observe(feedRoot, { childList: true, subtree: true });
		this.attached = true;
		this.onAttached?.();
	}

	private attachBody(): void {
		if (!document.body) return;
		this.bodyObserver = new MutationObserver(() => {
			const feedRoot = this.findFeedRoot();
			if (feedRoot) this.attachFeed(feedRoot);
		});
		this.bodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}
}

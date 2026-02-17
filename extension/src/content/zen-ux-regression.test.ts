import { describe, expect, it } from "bun:test";
import { createRenderCommitPipeline } from "./render-commit-pipeline";

class MockElement {
	public isConnected = true;
	public order = 0;
	public identity = "";

	constructor(order: number, identity: string) {
		this.order = order;
		this.identity = identity;
	}

	compareDocumentPosition(other: MockElement): number {
		if (this.order < other.order) return 4;
		if (this.order > other.order) return 2;
		return 0;
	}
}

type MockHTMLElement = MockElement & HTMLElement;

describe("zen UX regressions", () => {
	it("ignores stale classification results when a node identity changes before commit", () => {
		const applied: string[] = [];
		const post = new MockElement(1, "urn:li:activity:A") as MockHTMLElement;

		const pipeline = createRenderCommitPipeline({
			render: (_element, _decision, postId) => {
				applied.push(postId ?? "missing");
			},
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: post,
			decision: "hide",
			postId: "urn:li:activity:A",
			hideMode: "collapse",
			isStillValid: ({ renderRoot, postId }) => {
				const current = (renderRoot as MockHTMLElement).identity;
				return current === postId;
			},
		});

		post.identity = "urn:li:activity:B";
		pipeline.flushNow();

		expect(applied).toEqual([]);
	});

	it("applies collapse for in-viewport hide decisions immediately", () => {
		const applied: string[] = [];
		const post = new MockElement(1, "urn:li:activity:1") as MockHTMLElement;

		const pipeline = createRenderCommitPipeline({
			render: (_element, _decision, postId) => {
				applied.push(postId ?? "missing");
			},
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: post,
			decision: "hide",
			postId: "urn:li:activity:1",
			hideMode: "collapse",
		});
		pipeline.flushNow();

		expect(applied).toEqual(["urn:li:activity:1"]);
		expect(pipeline.size()).toBe(0);
	});
});

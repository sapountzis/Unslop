import { describe, expect, it } from "bun:test";
import { createRenderCommitPipeline } from "./render-commit-pipeline";

class MockElement {
	public isConnected = true;
	public order = 0;

	constructor(order: number) {
		this.order = order;
	}

	compareDocumentPosition(other: MockElement): number {
		if (this.order < other.order) return 4;
		if (this.order > other.order) return 2;
		return 0;
	}
}

type MockHTMLElement = MockElement & HTMLElement;

describe("render commit pipeline stability", () => {
	it("applies decisions in DOM order even when enqueued out of order", () => {
		const applied: string[] = [];
		const first = new MockElement(1) as MockHTMLElement;
		const second = new MockElement(2) as MockHTMLElement;

		const pipeline = createRenderCommitPipeline({
			render: (_element, _decision, postId) => {
				applied.push(postId ?? "missing");
			},
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: second,
			decision: "keep",
			postId: "post-2",
			hideMode: "collapse",
		});
		pipeline.enqueue({
			renderRoot: first,
			decision: "keep",
			postId: "post-1",
			hideMode: "collapse",
		});
		pipeline.flushNow();

		expect(applied).toEqual(["post-1", "post-2"]);
	});

	it("coalesces queued writes to the final decision per element", () => {
		const applied: string[] = [];
		const element = new MockElement(1) as MockHTMLElement;

		const pipeline = createRenderCommitPipeline({
			render: (_element, decision) => {
				applied.push(decision);
			},
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: element,
			decision: "hide",
			hideMode: "collapse",
		});
		pipeline.enqueue({
			renderRoot: element,
			decision: "keep",
			hideMode: "collapse",
		});
		pipeline.flushNow();

		expect(applied).toEqual(["keep"]);
	});

	it("drops disconnected elements without rendering", () => {
		const applied: string[] = [];
		const element = new MockElement(1) as MockHTMLElement;
		element.isConnected = false;

		const pipeline = createRenderCommitPipeline({
			render: (_element, decision) => {
				applied.push(decision);
			},
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: element,
			decision: "hide",
			hideMode: "collapse",
		});
		pipeline.flushNow();

		expect(applied).toEqual([]);
	});

	it("reports queued entries as actionable backlog", () => {
		const element = new MockElement(1) as MockHTMLElement;

		const pipeline = createRenderCommitPipeline({
			render: () => undefined,
			requestAnimationFrame: () => 1,
			cancelAnimationFrame: () => undefined,
		});

		pipeline.enqueue({
			renderRoot: element,
			decision: "hide",
			hideMode: "collapse",
		});
		expect(pipeline.size()).toBe(1);
		expect(pipeline.actionableSize()).toBe(1);
	});
});

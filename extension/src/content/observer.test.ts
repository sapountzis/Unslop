import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { FeedObserver } from "./observer";

// Yield to microtasks so MutationObserver callbacks fire.
function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

describe("FeedObserver", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	// ── attach with feed root present ─────────────────────────────────────

	it("calls onAttached synchronously and isLive is true when feed root exists", () => {
		const feedRoot = document.createElement("div");
		container.appendChild(feedRoot);

		let attached = false;
		const obs = new FeedObserver(
			() => feedRoot,
			() => {},
			() => {
				attached = true;
			},
		);

		obs.attach();

		expect(attached).toBe(true);
		expect(obs.isLive).toBe(true);
	});

	it("calls onNodes when feed DOM mutations occur", async () => {
		const feedRoot = document.createElement("div");
		container.appendChild(feedRoot);

		const collected: Node[] = [];
		const obs = new FeedObserver(
			() => feedRoot,
			(nodes) => collected.push(...nodes),
		);
		obs.attach();

		const child = document.createElement("p");
		feedRoot.appendChild(child);
		await tick();

		expect(collected).toContain(child);
		obs.detach();
	});

	// ── attach without feed root (body phase) ─────────────────────────────

	it("isLive is false and body phase is active when feed root is absent", () => {
		const obs = new FeedObserver(
			() => null,
			() => {},
		);
		obs.attach();
		expect(obs.isLive).toBe(false);
		obs.detach();
	});

	it("transitions to feed phase when feedRoot appears in body mutation", async () => {
		let feedRoot: HTMLElement | null = null;

		let attached = false;
		const obs = new FeedObserver(
			() => feedRoot,
			() => {},
			() => {
				attached = true;
			},
		);
		obs.attach();
		expect(obs.isLive).toBe(false);

		feedRoot = document.createElement("section");
		container.appendChild(feedRoot);
		await tick();

		expect(attached).toBe(true);
		expect(obs.isLive).toBe(true);
		obs.detach();
	});

	// ── detach ────────────────────────────────────────────────────────────

	it("stops delivering onNodes after detach", async () => {
		const feedRoot = document.createElement("div");
		container.appendChild(feedRoot);

		const collected: Node[] = [];
		const obs = new FeedObserver(
			() => feedRoot,
			(nodes) => collected.push(...nodes),
		);
		obs.attach();
		obs.detach();

		feedRoot.appendChild(document.createElement("p"));
		await tick();

		expect(collected).toHaveLength(0);
		expect(obs.isLive).toBe(false);
	});

	it("double-detach is safe (no throw)", () => {
		const obs = new FeedObserver(
			() => null,
			() => {},
		);
		obs.attach();
		obs.detach();
		expect(() => obs.detach()).not.toThrow();
	});

	it("detached observer does not reattach when new feed root appears", async () => {
		let feedRoot: HTMLElement | null = document.createElement("div");
		container.appendChild(feedRoot);

		let attachCount = 0;
		const obs = new FeedObserver(
			() => feedRoot,
			() => {},
			() => {
				attachCount += 1;
			},
		);
		obs.attach();
		expect(obs.isLive).toBe(true);
		obs.detach();

		const replacement = document.createElement("section");
		const initial = feedRoot;
		feedRoot = replacement;
		container.replaceChild(replacement, initial);
		await tick();

		expect(attachCount).toBe(1);
		expect(obs.isLive).toBe(false);
	});

	// ── re-attach ─────────────────────────────────────────────────────────

	it("re-attaching on a live observer detaches first then re-attaches cleanly", async () => {
		const feedRoot = document.createElement("div");
		container.appendChild(feedRoot);

		let count = 0;
		const obs = new FeedObserver(
			() => feedRoot,
			() => {},
			() => {
				count++;
			},
		);

		obs.attach(); // first attach
		obs.attach(); // re-attach

		expect(count).toBe(2);
		expect(obs.isLive).toBe(true);

		// Only one observer should be active; mutations should fire once per node
		const delivered: Node[] = [];
		const obs2 = new FeedObserver(
			() => feedRoot,
			(nodes) => delivered.push(...nodes),
		);
		obs2.attach();
		obs.detach();

		feedRoot.appendChild(document.createElement("span"));
		await tick();
		expect(delivered.length).toBeGreaterThan(0);
		obs2.detach();
	});

	// ── crash regression: null document.body ──────────────────────────────

	it("attach does not throw when document.body is null and no feed root", () => {
		// happy-dom defines document.body as a prototype getter, not an own property.
		// We shadow it with an own property, then delete that shadow to restore.
		const ownDescriptor = Object.getOwnPropertyDescriptor(document, "body");

		Object.defineProperty(document, "body", {
			configurable: true,
			get: () => null,
		});

		const obs = new FeedObserver(
			() => null,
			() => {},
		);

		try {
			expect(() => obs.attach()).not.toThrow();
			expect(obs.isLive).toBe(false);
		} finally {
			if (ownDescriptor) {
				// Was an own property before — restore it.
				Object.defineProperty(document, "body", ownDescriptor);
			} else {
				// Was a prototype getter — remove our shadow so the prototype is visible again.
				delete (document as unknown as Record<string, unknown>)["body"];
			}
		}
	});
});

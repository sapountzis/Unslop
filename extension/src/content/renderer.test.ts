/**
 * renderer.test.ts
 *
 * Tests for renderDecision and clearAllDecisions.
 * Requires happy-dom preload (bunfig.toml) for real DOM elements.
 */
import { describe, expect, it } from "bun:test";
import { renderDecision, clearAllDecisions } from "./renderer";
import { ATTRIBUTES } from "../lib/selectors";

function makeRoot(): HTMLElement {
	const el = document.createElement("div");
	document.body.appendChild(el);
	return el;
}

function cleanup(el: HTMLElement) {
	el.remove();
}

describe("renderDecision", () => {
	it("marks the element as processed", () => {
		const root = makeRoot();
		renderDecision(root, "keep", "collapse");
		expect(root.hasAttribute(ATTRIBUTES.processed)).toBe(true);
		cleanup(root);
	});

	it("does not add hide class for 'keep' in collapse mode", () => {
		const root = makeRoot();
		renderDecision(root, "keep", "collapse");
		expect(root.classList.contains("unslop-hidden-post")).toBe(false);
		cleanup(root);
	});

	it("adds hide class for 'hide' in collapse mode", () => {
		const root = makeRoot();
		renderDecision(root, "hide", "collapse");
		expect(root.classList.contains("unslop-hidden-post")).toBe(true);
		expect(root.getAttribute(ATTRIBUTES.decision)).toBe("hide");
		cleanup(root);
	});

	it("does not add hide class in label mode even for 'hide'", () => {
		const root = makeRoot();
		renderDecision(root, "hide", "label");
		expect(root.classList.contains("unslop-hidden-post")).toBe(false);
		expect(root.getAttribute(ATTRIBUTES.decision)).toBe("hide");
		cleanup(root);
	});

	it("adds a label pill in label mode", () => {
		const root = makeRoot();
		renderDecision(root, "keep", "label");
		const pill = root.querySelector(".unslop-decision-label");
		expect(pill).not.toBeNull();
		expect(pill?.textContent).toBe("Unslop: keep");
		cleanup(root);
	});

	it("does not add a label pill in collapse mode", () => {
		const root = makeRoot();
		renderDecision(root, "keep", "collapse");
		expect(root.querySelector(".unslop-decision-label")).toBeNull();
		cleanup(root);
	});

	it("replaces previous decision state when called twice", () => {
		const root = makeRoot();
		renderDecision(root, "hide", "label");
		renderDecision(root, "keep", "label");
		// Only one pill should remain
		expect(root.querySelectorAll(".unslop-decision-label").length).toBe(1);
		expect(root.getAttribute(ATTRIBUTES.decision)).toBeNull();
		cleanup(root);
	});
});

describe("clearAllDecisions", () => {
	it("removes all unslop attributes from processed elements", () => {
		const root = makeRoot();
		renderDecision(root, "hide", "label");
		expect(root.hasAttribute(ATTRIBUTES.processed)).toBe(true);

		clearAllDecisions();

		expect(root.hasAttribute(ATTRIBUTES.processed)).toBe(false);
		expect(root.hasAttribute(ATTRIBUTES.decision)).toBe(false);
		expect(root.classList.contains("unslop-hidden-post")).toBe(false);
		expect(root.querySelector(".unslop-decision-label")).toBeNull();
		cleanup(root);
	});

	it("is a no-op when no processed elements exist", () => {
		expect(() => clearAllDecisions()).not.toThrow();
	});
});

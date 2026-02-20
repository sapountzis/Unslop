// Renderer — applies hide/keep decisions directly to DOM elements.

import type { Decision } from "../types";
import type { HideRenderMode } from "../lib/config";
import { ATTRIBUTES } from "../lib/selectors";

export function renderDecision(
	labelRoot: HTMLElement,
	decision: Decision,
	mode: HideRenderMode,
	docRef: Pick<Document, "createElement"> = document,
): void {
	// Clear any previous state.
	labelRoot.removeAttribute(ATTRIBUTES.decision);
	labelRoot.classList.remove("unslop-hidden-post", "unslop-decision-host");
	labelRoot.querySelector(":scope > .unslop-decision-label")?.remove();

	labelRoot.setAttribute(ATTRIBUTES.processed, "true");

	if (mode === "label") {
		labelRoot.classList.add("unslop-decision-host");
		const pill = docRef.createElement("span");
		pill.className = `unslop-decision-label unslop-decision-label--${decision}`;
		pill.textContent = `Unslop: ${decision}`;
		labelRoot.append(pill);
	}

	if (decision === "hide") {
		labelRoot.setAttribute(ATTRIBUTES.decision, "hide");
		if (mode !== "label") {
			labelRoot.classList.add("unslop-hidden-post");
		}
	}
}

/** Remove all Unslop state from every processed element in the document. */
export function clearAllDecisions(
	docRef: Pick<Document, "querySelectorAll"> = document,
): void {
	for (const el of docRef.querySelectorAll<HTMLElement>(
		`[${ATTRIBUTES.processed}], [${ATTRIBUTES.decision}]`,
	)) {
		el.removeAttribute(ATTRIBUTES.processed);
		el.removeAttribute(ATTRIBUTES.decision);
		el.removeAttribute(ATTRIBUTES.identity);
		el.classList.remove("unslop-hidden-post", "unslop-decision-host");
		el.querySelector(":scope > .unslop-decision-label")?.remove();
	}
}

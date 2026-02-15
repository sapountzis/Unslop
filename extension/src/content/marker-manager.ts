import { ATTRIBUTES } from "../lib/selectors";
import type { PlatformSelectors } from "../platforms/platform";

function removeScopedChild(element: HTMLElement, selector: string): void {
	const child = element.querySelector<HTMLElement>(selector);
	child?.remove();
}

export function resetPostElementState(element: HTMLElement): void {
	element.removeAttribute(ATTRIBUTES.processing);
	element.removeAttribute(ATTRIBUTES.processed);
	element.removeAttribute(ATTRIBUTES.decision);
	element.removeAttribute(ATTRIBUTES.identity);
	element.classList.remove("unslop-hidden-post");
	element.classList.remove("unslop-decision-host");
	removeScopedChild(element, ":scope > .unslop-decision-label");
	removeScopedChild(element, ":scope > .unslop-hidden-label");
	element.style.opacity = "1";
}

export function clearUnslopStateInDocument(selectors: PlatformSelectors): void {
	const candidates = document.querySelectorAll(
		`${selectors.renderPostRoot}, ${selectors.candidatePostRoot}`,
	);
	for (const candidate of candidates) {
		if (candidate instanceof HTMLElement) {
			resetPostElementState(candidate);
		}
	}
}

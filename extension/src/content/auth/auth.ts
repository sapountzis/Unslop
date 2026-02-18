// extension/src/content/auth/auth.ts
// This script runs on https://api.getunslop.com/*
// It extracts the JWT from the auth callback page

import { SELECTORS } from "../../lib/selectors";
import { MESSAGE_TYPES } from "../../lib/messages";
import "../../styles/content.css";

/**
 * Extract JWT from page meta tag
 */
function extractJwtFromPage(): string | null {
	const metaTag = document.querySelector(SELECTORS.jwtMeta);

	if (metaTag instanceof HTMLMetaElement) {
		return metaTag.content;
	}

	return null;
}

/**
 * Send JWT to background script
 */
function sendJwtToBackground(jwt: string): void {
	chrome.runtime.sendMessage({
		type: MESSAGE_TYPES.SET_JWT,
		jwt,
	});
}

/**
 * Render success message
 */
function renderSuccessPage(): void {
	document.body.innerHTML = `
    <div class="unslop-auth-success">
      <div class="unslop-auth-success-content">
        <h1>Sign in successful</h1>
        <p>You can close this tab and return to your feed.</p>
      </div>
    </div>
  `;
}

// Try to extract JWT on page load
const jwt = extractJwtFromPage();

if (jwt) {
	sendJwtToBackground(jwt);
	renderSuccessPage();
}

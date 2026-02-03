// extension/src/content/auth.ts
// This script runs on https://api.getunslop.com/*
// It extracts the JWT from the auth callback page

function extractJwtFromPage(): string | null {
  // Check for meta tag with JWT
  const metaTag = document.querySelector('meta[name="unslop-jwt"]');

  if (metaTag instanceof HTMLMetaElement) {
    return metaTag.content;
  }

  return null;
}

function sendJwtToBackground(jwt: string): void {
  chrome.runtime.sendMessage({
    type: 'SET_JWT',
    jwt,
  });
}

// Try to extract JWT on page load
const jwt = extractJwtFromPage();

if (jwt) {
  sendJwtToBackground(jwt);

  // Show success message
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
      <div style="text-align: center;">
        <h1>Sign in successful</h1>
        <p>You can close this tab and return to LinkedIn.</p>
      </div>
    </div>
  `;
}

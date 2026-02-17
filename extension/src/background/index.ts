// extension/src/background/index.ts
import {
	getUserInfoWithUsage,
	createCheckout,
	startAuthFlow,
	getStats,
} from "./api";
import { MESSAGE_TYPES, type RuntimeRequest } from "../lib/messages";
import { resolveEnabled, toggleEnabled } from "../lib/enabled-state";
import { streamClassifyBatch } from "./classify-pipeline";

async function getJwtFromStorage(): Promise<string | null> {
	const storage = await chrome.storage.sync.get("jwt");
	return typeof storage.jwt === "string" && storage.jwt.length > 0
		? storage.jwt
		: null;
}

const SUPPORTED_FEED_HOSTS = new Set([
	"www.linkedin.com",
	"x.com",
	"twitter.com",
	"www.reddit.com",
	"old.reddit.com",
]);

function isSupportedFeedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return SUPPORTED_FEED_HOSTS.has(parsed.hostname);
	} catch {
		return false;
	}
}

function getHostname(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener(
	(message: RuntimeRequest, sender, sendResponse) => {
		(async () => {
			const { type } = message;

			try {
				switch (type) {
					case MESSAGE_TYPES.CLASSIFY_BATCH: {
						const storage = await chrome.storage.sync.get(["jwt", "enabled"]);

						if (!storage.jwt || !resolveEnabled(storage.enabled)) {
							sendResponse({ status: "disabled" });
							return;
						}

						const tabId = sender.tab?.id;
						if (!tabId) {
							sendResponse({ status: "error" });
							return;
						}

						streamClassifyBatch(message, storage.jwt, (item) => {
							void chrome.tabs.sendMessage(tabId, {
								type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
								item,
							});
						}).catch(() => {
							for (const post of message.posts) {
								void chrome.tabs.sendMessage(tabId, {
									type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
									item: {
										post_id: post.post_id,
									},
								});
							}
						});

						sendResponse({ status: "ok" });
						return;
					}

					case MESSAGE_TYPES.GET_USER_INFO: {
						const jwt = await getJwtFromStorage();
						if (jwt) {
							const userInfo = await getUserInfoWithUsage(jwt);
							sendResponse(userInfo);
						} else {
							sendResponse(null);
						}
						return;
					}

					case MESSAGE_TYPES.CREATE_CHECKOUT: {
						const jwt = await getJwtFromStorage();
						if (jwt) {
							const url = await createCheckout(jwt);
							sendResponse({ checkout_url: url });
						} else {
							sendResponse({ checkout_url: null });
						}
						return;
					}

					case MESSAGE_TYPES.START_AUTH: {
						await startAuthFlow(message.email);
						sendResponse({ status: "ok" });
						return;
					}

					case MESSAGE_TYPES.SET_JWT: {
						await chrome.storage.sync.set({ jwt: message.jwt });
						sendResponse({ status: "ok" });
						return;
					}

					case MESSAGE_TYPES.CLEAR_JWT: {
						await chrome.storage.sync.remove("jwt");
						sendResponse({ status: "ok" });
						return;
					}

					case MESSAGE_TYPES.TOGGLE_ENABLED: {
						const current = await chrome.storage.sync.get("enabled");
						const newValue = toggleEnabled(current.enabled);
						await chrome.storage.sync.set({ enabled: newValue });
						sendResponse({ enabled: newValue });
						return;
					}

					case MESSAGE_TYPES.RELOAD_ACTIVE_TAB: {
						const tab = await chrome.tabs.get(message.tabId).catch(() => null);
						if (!tab?.id || !tab.url || !isSupportedFeedUrl(tab.url)) {
							sendResponse({ status: "ignored" });
							return;
						}

						await chrome.tabs.reload(tab.id);
						sendResponse({ status: "reloaded" });
						return;
					}

					case MESSAGE_TYPES.GET_STATS: {
						const jwt = await getJwtFromStorage();
						if (jwt) {
							const stats = await getStats(jwt);
							sendResponse(stats);
						} else {
							sendResponse(null);
						}
						return;
					}

					case MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS: {
						const storage = await chrome.storage.sync.get(["jwt", "enabled"]);
						const [activeTab] = await chrome.tabs.query({
							active: true,
							currentWindow: true,
						});
						const activeTabUrl =
							typeof activeTab?.url === "string" ? activeTab.url : null;
						const activeTabHost = getHostname(activeTabUrl ?? undefined);

						sendResponse({
							status: "ok",
							snapshot: {
								enabled: resolveEnabled(storage.enabled),
								hasJwt:
									typeof storage.jwt === "string" && storage.jwt.length > 0,
								activeTabId:
									typeof activeTab?.id === "number" ? activeTab.id : null,
								activeTabUrl,
								activeTabHost,
								activeTabIsLinkedIn: activeTabHost === "www.linkedin.com",
								activeTabIsSupportedFeedHost:
									activeTabUrl !== null && isSupportedFeedUrl(activeTabUrl),
							},
						});
						return;
					}

					default:
						sendResponse({ error: "Unknown message type" });
				}
			} catch (error) {
				console.error("Message handler error:", error);
				try {
					sendResponse({ error: "Internal error" });
				} catch {
					// Channel already closed, ignore
				}
			}
		})();

		return true;
	},
);

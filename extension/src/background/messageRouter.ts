import type { MessageType, RuntimeRequest } from "../lib/messages";

export type RuntimeMessageHandler = (
	message: RuntimeRequest,
	sender: chrome.runtime.MessageSender,
) => Promise<unknown>;

export type RuntimeMessageHandlers = Partial<
	Record<MessageType, RuntimeMessageHandler>
>;

export function createMessageRouter(
	handlers: RuntimeMessageHandlers,
): (
	message: RuntimeRequest,
	sender: chrome.runtime.MessageSender,
	sendResponse: (response?: unknown) => void,
) => boolean {
	return (message, sender, sendResponse) => {
		const handler = handlers[message.type];
		if (!handler) {
			sendResponse({ error: "Unknown message type" });
			return false;
		}

		void handler(message, sender)
			.then((response) => {
				sendResponse(response);
			})
			.catch((error) => {
				console.error("Message handler error:", error);
				try {
					sendResponse({ error: "Internal error" });
				} catch {
					// Channel already closed, ignore.
				}
			});

		return true;
	};
}

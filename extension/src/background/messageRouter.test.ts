import { describe, expect, it } from "bun:test";
import { MESSAGE_TYPES, type RuntimeRequest } from "../lib/messages";
import { createMessageRouter } from "./messageRouter";

type MessageSender = chrome.runtime.MessageSender;

function waitForAsyncHandler(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("background message router", () => {
	it("routes handled message types and resolves async responses", async () => {
		const router = createMessageRouter({
			[MESSAGE_TYPES.GET_LOCAL_STATS]: async () => ({ stats: "ok" }),
		});

		let response: unknown = null;
		const keepChannel = router(
			{ type: MESSAGE_TYPES.GET_LOCAL_STATS } as RuntimeRequest,
			{} as MessageSender,
			(value) => {
				response = value;
			},
		);

		expect(keepChannel).toBe(true);
		await waitForAsyncHandler();
		expect(response).toEqual({ stats: "ok" });
	});

	it("returns unknown message error for unregistered message types", () => {
		const router = createMessageRouter({});

		let response: unknown = null;
		const keepChannel = router(
			{ type: MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS } as RuntimeRequest,
			{} as MessageSender,
			(value) => {
				response = value;
			},
		);

		expect(keepChannel).toBe(false);
		expect(response).toEqual({ error: "Unknown message type" });
	});

	it("converts thrown handler errors into internal error responses", async () => {
		const router = createMessageRouter({
			[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]: async () => {
				throw new Error("boom");
			},
		});

		let response: unknown = null;
		const keepChannel = router(
			{ type: MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS } as RuntimeRequest,
			{} as MessageSender,
			(value) => {
				response = value;
			},
		);

		expect(keepChannel).toBe(true);
		await waitForAsyncHandler();
		expect(response).toEqual({ error: "Internal error" });
	});
});

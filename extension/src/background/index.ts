import { createBackgroundMessageHandlers } from "./handlers";
import { createMessageRouter } from "./message-router";

const handlers = createBackgroundMessageHandlers();

chrome.runtime.onMessage.addListener(createMessageRouter(handlers));

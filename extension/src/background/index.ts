import { createBackgroundMessageHandlers } from "./handlers";
import { createMessageRouter } from "./messageRouter";

const handlers = createBackgroundMessageHandlers();

chrome.runtime.onMessage.addListener(createMessageRouter(handlers));

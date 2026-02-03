// extension/src/background/index.ts
import { classifyPost, sendFeedback } from './api';
// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    async function handleMessage() {
        const { type } = message;
        switch (type) {
            case 'CLASSIFY_POST': {
                const storage = await chrome.storage.sync.get(['jwt', 'enabled']);
                if (!storage.jwt || storage.enabled === false) {
                    sendResponse({
                        post_id: message.post.post_id,
                        decision: 'keep',
                        source: 'error',
                    });
                    return;
                }
                try {
                    const result = await classifyPost(message, storage.jwt);
                    sendResponse(result);
                }
                catch (err) {
                    sendResponse({
                        post_id: message.post.post_id,
                        decision: 'keep',
                        source: 'error',
                    });
                }
                break;
            }
            case 'SEND_FEEDBACK': {
                const storage = await chrome.storage.sync.get('jwt');
                if (storage.jwt) {
                    await sendFeedback(message, storage.jwt);
                }
                sendResponse({ status: 'ok' });
                break;
            }
            case 'GET_USER_INFO': {
                const storage = await chrome.storage.sync.get('jwt');
                if (storage.jwt) {
                    const { getUserInfo } = await import('./api');
                    const userInfo = await getUserInfo(storage.jwt);
                    sendResponse(userInfo);
                }
                else {
                    sendResponse(null);
                }
                break;
            }
            case 'CREATE_CHECKOUT': {
                const storage = await chrome.storage.sync.get('jwt');
                if (storage.jwt) {
                    const { createCheckout } = await import('./api');
                    const url = await createCheckout(storage.jwt);
                    sendResponse({ checkout_url: url });
                }
                else {
                    sendResponse({ checkout_url: null });
                }
                break;
            }
            case 'START_AUTH': {
                const { startAuthFlow } = await import('./api');
                await startAuthFlow(message.email);
                sendResponse({ status: 'ok' });
                break;
            }
            case 'SET_JWT': {
                await chrome.storage.sync.set({ jwt: message.jwt });
                sendResponse({ status: 'ok' });
                break;
            }
            case 'CLEAR_JWT': {
                await chrome.storage.sync.remove('jwt');
                sendResponse({ status: 'ok' });
                break;
            }
            case 'TOGGLE_ENABLED': {
                const current = await chrome.storage.sync.get('enabled');
                const newValue = current.enabled === false ? true : false;
                await chrome.storage.sync.set({ enabled: newValue });
                sendResponse({ enabled: newValue });
                break;
            }
            default:
                sendResponse({ error: 'Unknown message type' });
        }
    }
    // Return true for async response
    handleMessage().catch(console.error);
    return true;
});
// Listen for messages from auth callback page
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (sender.origin !== 'https://api.getunslop.com') {
        return;
    }
    if (message.type === 'UNSLOP_AUTH_SUCCESS') {
        chrome.storage.sync.set({ jwt: message.token });
        sendResponse({ status: 'ok' });
    }
});

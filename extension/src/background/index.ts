// extension/src/background/index.ts
import {
  classifyPost,
  sendFeedback,
  getUserInfo,
  createCheckout,
  startAuthFlow,
  getUsage,
  getStats,
} from './api';
import { ClassifyRequest, FeedbackRequest } from '../types';
import { AUTH_CALLBACK_ORIGIN } from '../lib/config';

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const { type } = message;

    try {
      switch (type) {
        case 'CLASSIFY_POST': {
          const storage = await chrome.storage.sync.get(['jwt', 'enabled']);

          if (!storage.jwt || storage.enabled === false) {
            sendResponse({
              post_id: message.post.post_id,
              decision: 'keep',
              source: 'error' as const,
            });
            return;
          }

          try {
            const result = await classifyPost(message as ClassifyRequest, storage.jwt);
            sendResponse(result);
          } catch (err) {
            sendResponse({
              post_id: message.post.post_id,
              decision: 'keep',
              source: 'error' as const,
            });
          }
          return;
        }

        case 'SEND_FEEDBACK': {
          const storage = await chrome.storage.sync.get('jwt');

          if (storage.jwt) {
            await sendFeedback(message as FeedbackRequest, storage.jwt);
          }

          sendResponse({ status: 'ok' });
          return;
        }

        case 'GET_USER_INFO': {
          const storage = await chrome.storage.sync.get('jwt');

          if (storage.jwt) {
            const userInfo = await getUserInfo(storage.jwt);
            sendResponse(userInfo);
          } else {
            sendResponse(null);
          }
          return;
        }

        case 'CREATE_CHECKOUT': {
          const storage = await chrome.storage.sync.get('jwt');

          if (storage.jwt) {
            const url = await createCheckout(storage.jwt);
            sendResponse({ checkout_url: url });
          } else {
            sendResponse({ checkout_url: null });
          }
          return;
        }

        case 'START_AUTH': {
          await startAuthFlow(message.email);
          sendResponse({ status: 'ok' });
          return;
        }

        case 'SET_JWT': {
          await chrome.storage.sync.set({ jwt: message.jwt });
          sendResponse({ status: 'ok' });
          return;
        }

        case 'CLEAR_JWT': {
          await chrome.storage.sync.remove('jwt');
          sendResponse({ status: 'ok' });
          return;
        }

        case 'TOGGLE_ENABLED': {
          const current = await chrome.storage.sync.get('enabled');
          const newValue = current.enabled === false ? true : false;
          await chrome.storage.sync.set({ enabled: newValue });
          sendResponse({ enabled: newValue });
          return;
        }

        case 'GET_USAGE': {
          const storage = await chrome.storage.sync.get('jwt');

          if (storage.jwt) {
            const usage = await getUsage(storage.jwt);
            sendResponse(usage);
          } else {
            sendResponse(null);
          }
          return;
        }

        case 'GET_STATS': {
          const storage = await chrome.storage.sync.get('jwt');

          if (storage.jwt) {
            const stats = await getStats(storage.jwt);
            sendResponse(stats);
          } else {
            sendResponse(null);
          }
          return;
        }

        default:
          sendResponse({ error: 'Unknown message type' });


      }
    } catch (error) {
      console.error('Message handler error:', error);
      try {
        sendResponse({ error: 'Internal error' });
      } catch {
        // Channel already closed, ignore
      }
    }
  })();

  return true;
});

// Listen for messages from auth callback page
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (sender.origin !== AUTH_CALLBACK_ORIGIN) {
      return;
    }

    if (message.type === 'UNSLOP_AUTH_SUCCESS') {
      chrome.storage.sync.set({ jwt: message.token });
      sendResponse({ status: 'ok' });
    }
  }
);

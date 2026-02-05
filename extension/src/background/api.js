import { API_BASE_URL } from '../lib/config';
import { parseNdjson } from './ndjson';
const API_BASE = `${API_BASE_URL}/v1`;
export async function classifyPost(request, jwt) {
    const response = await fetch(`${API_BASE}/classify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        if (response.status === 401) {
            // Clear invalid token
            await chrome.storage.sync.remove('jwt');
            // Notify popup
            chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' });
        }
        // Fail open - return keep
        return {
            post_id: request.post.post_id,
            decision: 'keep',
            source: 'error',
        };
    }
    return response.json();
}
export async function classifyPostsBatch(request, jwt, onItem) {
    const response = await fetch(`${API_BASE}/classify/batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        if (response.status === 401) {
            await chrome.storage.sync.remove('jwt');
            chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' });
        }
        return;
    }
    if (!response.body) {
        return;
    }
    for await (const item of parseNdjson(response.body)) {
        onItem(item);
    }
}
export async function sendFeedback(request, jwt) {
    const response = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify(request),
    });
    // Ignore errors - feedback is optional
}
export async function getUserInfo(jwt) {
    const response = await fetch(`${API_BASE}/me`, {
        headers: {
            'Authorization': `Bearer ${jwt}`,
        },
    });
    if (!response.ok) {
        return null;
    }
    return response.json();
}
export async function createCheckout(jwt) {
    const response = await fetch(`${API_BASE}/billing/create-checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ plan: 'pro-monthly' }),
    });
    if (!response.ok) {
        return null;
    }
    const data = await response.json();
    return data.checkout_url;
}
export async function startAuthFlow(email) {
    const response = await fetch(`${API_BASE}/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    // 202 means email was sent
    if (response.status !== 202) {
        throw new Error('Failed to start auth flow');
    }
}
export async function getUsage(jwt) {
    const response = await fetch(`${API_BASE}/usage`, {
        headers: {
            'Authorization': `Bearer ${jwt}`,
        },
    });
    if (!response.ok) {
        return null;
    }
    return response.json();
}
export async function getStats(jwt) {
    const response = await fetch(`${API_BASE}/stats`, {
        headers: {
            'Authorization': `Bearer ${jwt}`,
        },
    });
    if (!response.ok) {
        return null;
    }
    return response.json();
}

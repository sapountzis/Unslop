// extension/src/background/api.ts
import {
  BatchClassifyRequest,
  BatchClassifyResult,
  UserInfo,
  UsageInfo,
  StatsInfo,
} from '../types';
import { API_BASE_URL } from '../lib/config';
import { parseNdjson } from './ndjson';

const API_BASE = `${API_BASE_URL}/v1`;

export async function classifyPostsBatch(
  request: BatchClassifyRequest,
  jwt: string,
  onItem: (item: BatchClassifyResult) => void
): Promise<void> {
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
    }
    return;
  }

  if (!response.body) {
    return;
  }

  for await (const item of parseNdjson<BatchClassifyResult>(response.body)) {
    onItem(item);
  }
}

export async function getUserInfo(jwt: string): Promise<UserInfo | null> {
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

export async function createCheckout(jwt: string): Promise<string | null> {
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

export async function startAuthFlow(email: string): Promise<void> {
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

export async function getUsage(jwt: string): Promise<UsageInfo | null> {
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

export async function getStats(jwt: string): Promise<StatsInfo | null> {
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

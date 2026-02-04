// extension/src/lib/storage.ts
import { Storage, CachedDecision, Decision, Source } from '../types';
import { CACHE_TTL_MS } from './config';

const DEFAULT_STORAGE: Partial<Storage> = {
  enabled: true,
};

export async function getStorage(): Promise<Storage> {
  const result = await chrome.storage.sync.get(DEFAULT_STORAGE);
  return result as Storage;
}

export async function setStorage(values: Partial<Storage>): Promise<void> {
  await chrome.storage.sync.set(values);
}

export async function getJwt(): Promise<string | undefined> {
  const storage = await getStorage();
  return storage.jwt;
}

export async function setJwt(jwt: string): Promise<void> {
  await setStorage({ jwt });
}

export async function clearJwt(): Promise<void> {
  await chrome.storage.sync.remove('jwt');
}

export async function isEnabled(): Promise<boolean> {
  const storage = await getStorage();
  return storage.enabled !== false;
}

// Decision cache functions
export async function getCachedDecision(postId: string): Promise<CachedDecision | null> {
  const storage = await getStorage();
  const cached = storage.decisionCache?.[postId];

  if (!cached) {
    return null;
  }

  // Check if expired
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL_MS) {
    // Remove expired entry
    await removeCachedDecision(postId);
    return null;
  }

  return cached;
}

export async function setCachedDecision(
  postId: string,
  decision: Decision,
  source: Source
): Promise<void> {
  const storage = await getStorage();
  const decisionCache = storage.decisionCache || {};

  decisionCache[postId] = {
    decision,
    source,
    timestamp: Date.now(),
  };

  await chrome.storage.sync.set({ decisionCache });
}

export async function removeCachedDecision(postId: string): Promise<void> {
  const storage = await getStorage();
  if (!storage.decisionCache) return;

  delete storage.decisionCache[postId];
  await chrome.storage.sync.set({ decisionCache: storage.decisionCache });
}

export async function cleanupExpiredCache(): Promise<void> {
  const storage = await getStorage();
  if (!storage.decisionCache) return;

  const now = Date.now();
  const decisionCache = storage.decisionCache;
  const expiredKeys: string[] = [];

  for (const [postId, cached] of Object.entries(decisionCache)) {
    if (now - cached.timestamp > CACHE_TTL_MS) {
      expiredKeys.push(postId);
    }
  }

  for (const key of expiredKeys) {
    delete decisionCache[key];
  }

  if (expiredKeys.length > 0) {
    await chrome.storage.sync.set({ decisionCache });
  }
}

const DEFAULT_STORAGE = {
    enabled: true,
};
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export async function getStorage() {
    const result = await chrome.storage.sync.get(DEFAULT_STORAGE);
    return result;
}
export async function setStorage(values) {
    await chrome.storage.sync.set(values);
}
export async function getJwt() {
    const storage = await getStorage();
    return storage.jwt;
}
export async function setJwt(jwt) {
    await setStorage({ jwt });
}
export async function clearJwt() {
    await chrome.storage.sync.remove('jwt');
}
export async function isEnabled() {
    const storage = await getStorage();
    return storage.enabled !== false;
}
// Decision cache functions
export async function getCachedDecision(postId) {
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
export async function setCachedDecision(postId, decision, source) {
    const storage = await getStorage();
    const decisionCache = storage.decisionCache || {};
    decisionCache[postId] = {
        decision,
        source,
        timestamp: Date.now(),
    };
    await chrome.storage.sync.set({ decisionCache });
}
export async function removeCachedDecision(postId) {
    const storage = await getStorage();
    if (!storage.decisionCache)
        return;
    delete storage.decisionCache[postId];
    await chrome.storage.sync.set({ decisionCache: storage.decisionCache });
}
export async function cleanupExpiredCache() {
    const storage = await getStorage();
    if (!storage.decisionCache)
        return;
    const now = Date.now();
    const decisionCache = storage.decisionCache;
    const expiredKeys = [];
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

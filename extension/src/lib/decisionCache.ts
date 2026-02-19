// extension/src/lib/decision-cache.ts
import { CachedDecision, Decision, Source } from "../types";
import { CACHE_TTL_MS, CACHE_MAX_ITEMS, DEBUG_CONTENT_RUNTIME } from "./config";

const DEFAULT_CACHE = {
	decisionCache: {},
};

type DecisionCacheStore = Record<string, CachedDecision>;
type DebugContext = Record<
	string,
	string | number | boolean | null | undefined
>;

function debugLog(message: string, context?: DebugContext): void {
	if (!DEBUG_CONTENT_RUNTIME) return;
	if (typeof context === "undefined") {
		console.debug(message);
		return;
	}
	console.debug(message, context);
}

export class DecisionCacheService {
	async get(postId: string): Promise<CachedDecision | null> {
		const decisionCache = await this.read();
		const cached = decisionCache[postId];

		if (!cached) {
			debugLog("[Unslop][cache] miss", {
				postId,
				cacheSize: this.size(decisionCache),
			});
			return null;
		}

		if (this.isExpired(cached)) {
			delete decisionCache[postId];
			await this.write(decisionCache);
			debugLog("[Unslop][cache] expired", { postId });
			return null;
		}

		debugLog("[Unslop][cache] hit", { postId, source: cached.source });
		return cached;
	}

	async set(postId: string, decision: Decision, source: Source): Promise<void> {
		const decisionCache = await this.read();

		decisionCache[postId] = {
			decision,
			source,
			timestamp: Date.now(),
		};

		this.enforceLimit(decisionCache);
		await this.write(decisionCache);

		debugLog("[Unslop][cache] set", {
			postId,
			decision,
			source,
			cacheSize: this.size(decisionCache),
		});
	}

	async cleanupExpired(): Promise<void> {
		const decisionCache = await this.read();

		const expiredKeys = Object.entries(decisionCache)
			.filter(([, cached]) => this.isExpired(cached))
			.map(([postId]) => postId);

		for (const key of expiredKeys) {
			delete decisionCache[key];
		}

		const evicted = this.enforceLimit(decisionCache);

		if (expiredKeys.length > 0 || evicted) {
			await this.write(decisionCache);
		}
	}

	private async read(): Promise<DecisionCacheStore> {
		const storage = await chrome.storage.local.get(DEFAULT_CACHE);
		return storage.decisionCache || {};
	}

	private async write(decisionCache: DecisionCacheStore): Promise<void> {
		await chrome.storage.local.set({ decisionCache });
	}

	private isExpired(cached: CachedDecision): boolean {
		return Date.now() - cached.timestamp > CACHE_TTL_MS;
	}

	private size(decisionCache: DecisionCacheStore): number {
		return Object.keys(decisionCache).length;
	}

	private enforceLimit(decisionCache: DecisionCacheStore): boolean {
		const keys = Object.keys(decisionCache);
		if (keys.length <= CACHE_MAX_ITEMS) return false;

		const toEvict = keys
			.sort((a, b) => decisionCache[a].timestamp - decisionCache[b].timestamp)
			.slice(0, keys.length - CACHE_MAX_ITEMS);

		for (const key of toEvict) {
			delete decisionCache[key];
		}

		return toEvict.length > 0;
	}
}

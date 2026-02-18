// extension/src/lib/media-hydration.ts
// Generic wait for img src/srcset hydration. Used by parsers to avoid extracting before lazy-loaded images appear.

const DEFAULT_MEDIA_WAIT_TIMEOUT_MS = 1500;
const MEDIA_WAIT_MIN_GRACE_MS = 120;
const MEDIA_WAIT_QUIET_WINDOW_MS = 120;
const MEDIA_WAIT_NO_HINT_TIMEOUT_MS = 350;
const MEDIA_WAIT_NO_HINT_MIN_GRACE_MS = 40;
const MEDIA_WAIT_NO_HINT_QUIET_WINDOW_MS = 40;
const MEDIA_WAIT_POLL_INTERVAL_MS = 50;

export type WaitScope = { root: HTMLElement };

function queryAll(root: HTMLElement, selector: string): HTMLElement[] {
	const q = (
		root as unknown as {
			querySelectorAll?: (s: string) => NodeListOf<HTMLElement>;
		}
	).querySelectorAll;
	if (typeof q !== "function") return [];
	const r = q.call(root, selector);
	return Array.isArray(r) ? r : Array.from(r);
}

function queryOne(root: HTMLElement, selector: string): HTMLElement | null {
	const q = (
		root as unknown as { querySelector?: (s: string) => HTMLElement | null }
	).querySelector;
	if (typeof q !== "function") return null;
	return q.call(root, selector);
}

function readImgSrc(img: HTMLElement): string | null {
	const getAttr = img.getAttribute?.bind(img);
	if (!getAttr) return null;
	const src = getAttr("src");
	if (src?.trim()) return src.trim();
	const currentSrc = (img as unknown as { currentSrc?: string }).currentSrc;
	if (typeof currentSrc === "string" && currentSrc.trim())
		return currentSrc.trim();
	const srcset = getAttr("srcset");
	if (srcset) {
		const first = srcset.split(",", 1)[0]?.trim().split(/\s+/, 1)[0];
		if (first) return first;
	}
	const style = getAttr("style");
	if (style?.includes("background-image")) {
		const m = style.match(/url\((['"]?)(.*?)\1\)/i);
		if (m?.[2]?.trim()) return m[2].trim();
	}
	const parent = img.parentElement;
	if (parent) {
		const styled = queryAll(parent, '[style*="background-image"]');
		for (const s of styled) {
			const u = readImgSrc(s as HTMLElement);
			if (u) return u;
		}
		const parentStyle = parent.getAttribute?.("style");
		if (parentStyle?.includes("background-image")) {
			const m = parentStyle.match(/url\((['"]?)(.*?)\1\)/i);
			if (m?.[2]?.trim()) return m[2].trim();
		}
	}
	return null;
}

function hasHydratedPhoto(scopes: WaitScope[], imgSelector: string): boolean {
	for (const { root } of scopes) {
		for (const img of queryAll(root, imgSelector)) {
			if (readImgSrc(img)) return true;
		}
	}
	return false;
}

function hasMediaHint(scopes: WaitScope[], hintSelector: string): boolean {
	for (const { root } of scopes) {
		if (queryOne(root, hintSelector)) return true;
	}
	return false;
}

export type WaitForMediaHydrationOptions = {
	timeoutMs?: number;
	/** Selector for imgs to check for hydrated src. Default "img". */
	imgSelector?: string;
	/** Selector for media hint (img/video/link) that extends wait. Default "img". */
	hintSelector?: string;
	/** When set, only consider imgs matching this as "hydrated" (e.g. a[href*="/photo/"] img to exclude avatars). */
	hydratedPhotoSelector?: string;
};

/**
 * Waits for at least one img in the given scopes to have a resolvable src (src, srcset, or background-image).
 * Observes childList and attributes (src, srcset, style) for hydration.
 */
export async function waitForMediaHydration(
	scopes: WaitScope[],
	options: WaitForMediaHydrationOptions = {},
): Promise<void> {
	if (scopes.length === 0) return;

	const imgSelector = options.imgSelector ?? "img";
	const hintSelector = options.hintSelector ?? "img";
	const hydratedSelector =
		options.hydratedPhotoSelector ?? options.imgSelector ?? "img";

	if (hasHydratedPhoto(scopes, hydratedSelector)) return;

	const timeoutMs = options.timeoutMs ?? DEFAULT_MEDIA_WAIT_TIMEOUT_MS;
	const hintedAtStart = hasMediaHint(scopes, hintSelector);
	const effectiveTimeoutMs = hintedAtStart
		? timeoutMs
		: Math.min(timeoutMs, MEDIA_WAIT_NO_HINT_TIMEOUT_MS);
	const minGraceMs = hintedAtStart
		? MEDIA_WAIT_MIN_GRACE_MS
		: MEDIA_WAIT_NO_HINT_MIN_GRACE_MS;
	const quietWindowMs = hintedAtStart
		? MEDIA_WAIT_QUIET_WINDOW_MS
		: MEDIA_WAIT_NO_HINT_QUIET_WINDOW_MS;

	await new Promise<void>((resolve) => {
		let settled = false;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;
		let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
		let observer: MutationObserver | null = null;
		let lastMutationAt = Date.now();
		const startedAt = Date.now();

		const finish = (): void => {
			if (settled) return;
			settled = true;
			if (pollTimer !== null) {
				clearTimeout(pollTimer);
				pollTimer = null;
			}
			if (timeoutTimer !== null) {
				clearTimeout(timeoutTimer);
				timeoutTimer = null;
			}
			try {
				observer?.disconnect();
			} catch {
				// Happy-dom MutationObserver bug workaround
			}
			resolve();
		};

		const shouldStopWithoutMedia = (): boolean => {
			const now = Date.now();
			if (now - startedAt < minGraceMs) return false;
			if (hasMediaHint(scopes, hintSelector)) return false;
			return now - lastMutationAt >= quietWindowMs;
		};

		const check = (): void => {
			if (hasHydratedPhoto(scopes, hydratedSelector)) {
				finish();
				return;
			}
			if (
				Date.now() - startedAt >= effectiveTimeoutMs ||
				shouldStopWithoutMedia()
			) {
				finish();
				return;
			}
			pollTimer = setTimeout(check, MEDIA_WAIT_POLL_INTERVAL_MS);
		};

		if (typeof globalThis.MutationObserver === "function") {
			observer = new MutationObserver(() => {
				lastMutationAt = Date.now();
			});
			for (const { root } of scopes) {
				try {
					observer.observe(root, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: ["src", "srcset", "style"],
					});
				} catch {
					// Duck-typed element may not support observe
				}
			}
		}

		timeoutTimer = setTimeout(finish, effectiveTimeoutMs);
		check();
	});
}

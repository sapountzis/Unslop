function readAttribute(
	element:
		| { getAttribute?: (name: string) => string | null }
		| null
		| undefined,
	attribute: string,
): string | null {
	if (!element || typeof element.getAttribute !== "function") {
		return null;
	}

	return element.getAttribute(attribute);
}

function queryAllElements(root: HTMLElement, selector: string): HTMLElement[] {
	const querySelectorAll = (
		root as unknown as {
			querySelectorAll?: (
				value: string,
			) => NodeListOf<HTMLElement> | HTMLElement[];
		}
	).querySelectorAll;

	if (typeof querySelectorAll !== "function") {
		return [];
	}

	const result = querySelectorAll.call(root, selector);
	if (Array.isArray(result)) {
		return result;
	}

	return Array.from(result);
}

function parseSrcset(srcset: string | null): string | null {
	if (!srcset) return null;
	const firstCandidate = srcset.split(",", 1)[0]?.trim().split(/\s+/, 1)[0];
	return firstCandidate || null;
}

function parseBackgroundImageUrl(style: string | null): string | null {
	if (!style?.includes("background-image")) return null;
	const match = style.match(/url\((['"]?)(.*?)\1\)/i);
	if (!match) return null;
	const extracted = match[2]?.trim();
	return extracted || null;
}

export function readBestImageSource(
	element: HTMLElement | null | undefined,
): string | null {
	if (!element) return null;

	const src = readAttribute(element, "src");
	if (src?.trim()) return src.trim();

	const currentSrc = (element as unknown as { currentSrc?: string }).currentSrc;
	if (typeof currentSrc === "string" && currentSrc.trim()) {
		return currentSrc.trim();
	}

	const srcsetSource = parseSrcset(readAttribute(element, "srcset"));
	if (srcsetSource) return srcsetSource;

	const styleSource = parseBackgroundImageUrl(readAttribute(element, "style"));
	if (styleSource) return styleSource;

	return null;
}

export function readBestImageSourceWithAncestors(
	element: HTMLElement,
	maxDepth = 3,
): string | null {
	const directSource = readBestImageSource(element);
	if (directSource) return directSource;

	let current: HTMLElement | null = element.parentElement;
	let depth = 0;

	while (current && depth < maxDepth) {
		const currentSource = readBestImageSource(current);
		if (currentSource) return currentSource;

		const styledChildren = queryAllElements(
			current,
			'[style*="background-image"]',
		);
		for (const styledChild of styledChildren) {
			const styledSource = readBestImageSource(styledChild);
			if (styledSource) return styledSource;
		}

		current = current.parentElement;
		depth += 1;
	}

	return null;
}

import type { PlatformId } from "./platform";

type PlatformDescriptor = {
	id: PlatformId;
	hosts: readonly string[];
};

const SUPPORTED_PLATFORMS: readonly PlatformDescriptor[] = [
	{
		id: "linkedin",
		hosts: ["www.linkedin.com"],
	},
	{
		id: "x",
		hosts: ["x.com", "twitter.com"],
	},
	{
		id: "reddit",
		hosts: ["www.reddit.com", "old.reddit.com"],
	},
];

function normalizeHostname(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

export function resolveSupportedPlatformIdFromHost(
	host: string | null,
): PlatformId | null {
	if (!host) return null;
	for (const platform of SUPPORTED_PLATFORMS) {
		if (platform.hosts.includes(host)) {
			return platform.id;
		}
	}
	return null;
}

export function resolveSupportedPlatformIdFromUrl(
	url: string | null | undefined,
): PlatformId | null {
	return resolveSupportedPlatformIdFromHost(normalizeHostname(url));
}

export function isSupportedPlatformUrl(url: string): boolean {
	return resolveSupportedPlatformIdFromUrl(url) !== null;
}

export function getHostname(url: string | null | undefined): string | null {
	return normalizeHostname(url);
}

export function listSupportedPlatformHosts(): string[] {
	return SUPPORTED_PLATFORMS.flatMap((platform) => platform.hosts);
}

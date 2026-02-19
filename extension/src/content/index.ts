// Entry point for the content script pipeline.

import type { PlatformPlugin } from "../platforms/platform";
import { Pipeline } from "./pipeline";

export function createPlatformRuntime(platform: PlatformPlugin): void {
	const pipeline = new Pipeline(platform);
	void pipeline.start();
}

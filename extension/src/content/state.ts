// Pipeline state — enabled flag, hide mode, route key, processed set.

import type { HideRenderMode } from "../lib/config";
import { HIDE_RENDER_MODE } from "../lib/config";

export type PipelineState = {
	enabled: boolean;
	hideMode: HideRenderMode;
	routeKey: string;
	routeEligible: boolean;
	/** Render roots that have already been processed (terminal). */
	processed: WeakSet<HTMLElement>;
};

export function createState(): PipelineState {
	return {
		enabled: true,
		hideMode: HIDE_RENDER_MODE,
		routeKey: "",
		routeEligible: false,
		processed: new WeakSet(),
	};
}

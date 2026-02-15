import { HIDE_RENDER_MODE, HideRenderMode } from "./config";

export const HIDE_RENDER_MODE_STORAGE_KEY = "hideRenderMode";

export function resolveHideRenderMode(
	value: string | undefined,
): HideRenderMode {
	if (value === "collapse" || value === "label") return value;
	return HIDE_RENDER_MODE;
}

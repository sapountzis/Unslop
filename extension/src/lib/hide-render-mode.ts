import { HIDE_RENDER_MODE, HideRenderMode } from './config';

export const HIDE_RENDER_MODE_STORAGE_KEY = 'hideRenderMode';

export function resolveHideRenderMode(value: unknown): HideRenderMode {
  if (value === 'collapse' || value === 'stub') return value;
  return HIDE_RENDER_MODE;
}

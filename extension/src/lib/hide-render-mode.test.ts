import { describe, expect, it } from 'bun:test';
import { resolveHideRenderMode } from './hide-render-mode';
import { HIDE_RENDER_MODE } from './config';

describe('hide-render-mode', () => {
  it('accepts collapse', () => {
    expect(resolveHideRenderMode('collapse')).toBe('collapse');
  });

  it('accepts label', () => {
    expect(resolveHideRenderMode('label')).toBe('label');
  });

  it('falls back to default for invalid values', () => {
    expect(resolveHideRenderMode('invalid')).toBe(HIDE_RENDER_MODE);
    expect(resolveHideRenderMode(undefined)).toBe(HIDE_RENDER_MODE);
  });
});

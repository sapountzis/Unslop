// extension/src/lib/user-data.ts
import { Storage } from '../types';
import { resolveEnabled } from './enabled-state';
import { HIDE_RENDER_MODE_STORAGE_KEY, resolveHideRenderMode } from './hide-render-mode';
import { HIDE_RENDER_MODE } from './config';

const DEFAULT_STORAGE: Partial<Storage> = {
  enabled: true,
  hideRenderMode: HIDE_RENDER_MODE,
};

export class UserDataService {
  async getStorage(): Promise<Storage> {
    const result = await chrome.storage.sync.get(null);
    return {
      ...DEFAULT_STORAGE,
      ...result,
      enabled: resolveEnabled(result.enabled),
      hideRenderMode: resolveHideRenderMode(result[HIDE_RENDER_MODE_STORAGE_KEY]),
    } as Storage;
  }

  async isEnabled(): Promise<boolean> {
    const storage = await this.getStorage();
    return resolveEnabled(storage.enabled);
  }
}

// extension/src/lib/user-data.ts
import { Storage } from '../types';

const DEFAULT_STORAGE: Partial<Storage> = {
  enabled: true,
};

export class UserDataService {
  async getStorage(): Promise<Storage> {
    const result = await chrome.storage.sync.get(null);
    return { ...DEFAULT_STORAGE, ...result } as Storage;
  }

  async setStorage(values: Partial<Storage>): Promise<void> {
    await chrome.storage.sync.set(values);
  }

  async getJwt(): Promise<string | undefined> {
    const storage = await this.getStorage();
    return storage.jwt;
  }

  async setJwt(jwt: string): Promise<void> {
    await this.setStorage({ jwt });
  }

  async clearJwt(): Promise<void> {
    await chrome.storage.sync.remove('jwt');
  }

  async isEnabled(): Promise<boolean> {
    const storage = await this.getStorage();
    return storage.enabled !== false;
  }
}

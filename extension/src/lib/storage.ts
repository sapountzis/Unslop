// extension/src/lib/storage.ts
import { Storage } from '../types';

const DEFAULT_STORAGE: Partial<Storage> = {
  enabled: true,
};

export async function getStorage(): Promise<Storage> {
  const result = await chrome.storage.sync.get(DEFAULT_STORAGE);
  return result as Storage;
}

export async function setStorage(values: Partial<Storage>): Promise<void> {
  await chrome.storage.sync.set(values);
}

export async function getJwt(): Promise<string | undefined> {
  const storage = await getStorage();
  return storage.jwt;
}

export async function setJwt(jwt: string): Promise<void> {
  await setStorage({ jwt });
}

export async function clearJwt(): Promise<void> {
  await chrome.storage.sync.remove('jwt');
}

export async function isEnabled(): Promise<boolean> {
  const storage = await getStorage();
  return storage.enabled !== false;
}

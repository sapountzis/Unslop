const DEFAULT_STORAGE = {
    enabled: true,
};
export async function getStorage() {
    const result = await chrome.storage.sync.get(DEFAULT_STORAGE);
    return result;
}
export async function setStorage(values) {
    await chrome.storage.sync.set(values);
}
export async function getJwt() {
    const storage = await getStorage();
    return storage.jwt;
}
export async function setJwt(jwt) {
    await setStorage({ jwt });
}
export async function clearJwt() {
    await chrome.storage.sync.remove('jwt');
}
export async function isEnabled() {
    const storage = await getStorage();
    return storage.enabled !== false;
}

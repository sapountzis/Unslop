export function resolveEnabled(raw: unknown): boolean {
  return raw !== false;
}

export function toggleEnabled(current: unknown): boolean {
  return !resolveEnabled(current);
}

export function resolveEnabled(raw: boolean | null | undefined): boolean {
  return raw !== false;
}

export function toggleEnabled(current: boolean | null | undefined): boolean {
  return !resolveEnabled(current);
}

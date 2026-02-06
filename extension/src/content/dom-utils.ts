export function removeScopedChild(element: HTMLElement, selector: string): void {
  if (typeof (element as { querySelector?: unknown }).querySelector !== 'function') {
    return;
  }
  const child = element.querySelector(selector);
  if (child && typeof (child as { remove?: unknown }).remove === 'function') {
    (child as { remove: () => void }).remove();
  }
}

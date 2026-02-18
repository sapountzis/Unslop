// Navigation — detects SPA route changes by monkey-patching history methods.

export class NavigationHandler {
	private readonly origPush = history.pushState.bind(history);
	private readonly origReplace = history.replaceState.bind(history);
	private popHandler: (() => void) | null = null;

	constructor(private readonly onNavigate: () => void) {}

	setup(): void {
		this.popHandler = () => this.onNavigate();
		window.addEventListener("popstate", this.popHandler);

		history.pushState = (...args: Parameters<typeof history.pushState>) => {
			this.origPush(...args);
			this.onNavigate();
		};
		history.replaceState = (
			...args: Parameters<typeof history.replaceState>
		) => {
			this.origReplace(...args);
			this.onNavigate();
		};
	}

	dispose(): void {
		if (this.popHandler) {
			window.removeEventListener("popstate", this.popHandler);
			this.popHandler = null;
		}
		history.pushState = this.origPush;
		history.replaceState = this.origReplace;
	}
}

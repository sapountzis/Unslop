import { describe, expect, it, mock } from "bun:test";
import { NavigationHandler } from "./navigation";

describe("NavigationHandler", () => {
	it("calls onNavigate when pushState is called", () => {
		const onNavigate = mock(() => {});
		const nav = new NavigationHandler(onNavigate);
		nav.setup();

		history.pushState({}, "", window.location.href);
		expect(onNavigate).toHaveBeenCalledTimes(1);

		nav.dispose();
	});

	it("calls onNavigate when replaceState is called", () => {
		const onNavigate = mock(() => {});
		const nav = new NavigationHandler(onNavigate);
		nav.setup();

		history.replaceState({}, "", window.location.href);
		expect(onNavigate).toHaveBeenCalledTimes(1);

		nav.dispose();
	});

	it("calls onNavigate when popstate fires", () => {
		const onNavigate = mock(() => {});
		const nav = new NavigationHandler(onNavigate);
		nav.setup();

		window.dispatchEvent(new PopStateEvent("popstate"));
		expect(onNavigate).toHaveBeenCalledTimes(1);

		nav.dispose();
	});

	it("does not intercept pushState or replaceState after dispose", () => {
		const onNavigate = mock(() => {});
		const nav = new NavigationHandler(onNavigate);
		nav.setup();
		nav.dispose();

		// After dispose, pushState/replaceState should NOT trigger onNavigate
		history.pushState({}, "", window.location.href);
		history.replaceState({}, "", window.location.href);
		expect(onNavigate).toHaveBeenCalledTimes(0);
	});

	it("does not call onNavigate after dispose", () => {
		const onNavigate = mock(() => {});
		const nav = new NavigationHandler(onNavigate);
		nav.setup();
		nav.dispose();

		history.pushState({}, "", window.location.href);
		window.dispatchEvent(new PopStateEvent("popstate"));
		expect(onNavigate).toHaveBeenCalledTimes(0);
	});
});

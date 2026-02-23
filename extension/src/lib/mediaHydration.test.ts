import { describe, expect, it } from "bun:test";
import { waitForMediaHydration } from "./mediaHydration";

describe("waitForMediaHydration", () => {
	it("honors readyWhen instead of finishing on the first hydrated image", async () => {
		const root = document.createElement("div");

		const icon = document.createElement("img");
		icon.setAttribute(
			"src",
			"https://static.licdn.com/aero-v1/sc/h/8ekq8gho1ruaf8i7f86vd1ftt",
		);
		icon.setAttribute("width", "16");
		icon.setAttribute("height", "16");
		root.appendChild(icon);

		const contentImage = document.createElement("img");
		contentImage.setAttribute("width", "600");
		contentImage.setAttribute("height", "600");
		root.appendChild(contentImage);

		setTimeout(() => {
			contentImage.setAttribute(
				"src",
				"https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_800/A",
			);
		}, 25);

		await waitForMediaHydration([{ root }], {
			timeoutMs: 300,
			hintSelector: "img",
			readyWhen: (scopes) =>
				scopes.some(({ root: scopeRoot }) =>
					Array.from(scopeRoot.querySelectorAll("img")).some((img) =>
						(img.getAttribute("src") || "").includes("feedshare"),
					),
				),
		});

		expect(contentImage.getAttribute("src")).toBe(
			"https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_800/A",
		);
	});

	it("keeps default behavior when readyWhen is not provided", async () => {
		const root = document.createElement("div");
		const image = document.createElement("img");
		image.setAttribute("src", "https://example.com/image.jpg");
		root.appendChild(image);

		await waitForMediaHydration([{ root }], { timeoutMs: 100 });

		expect(image.getAttribute("src")).toBe("https://example.com/image.jpg");
	});
});

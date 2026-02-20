import { describe, expect, it } from "bun:test";
import { extractPostData, readPostIdentity } from "./parser";

const QUOTE_TWEET = '[role="link"][tabindex="0"]';

function makeElement(
	overrides: Partial<{
		matches: (s: string) => boolean;
		querySelector: (s: string) => any;
		querySelectorAll: (s: string) => any[];
		getAttribute: (s: string) => string | null;
		closest: (s: string) => any;
		contains: (e: any) => boolean;
		tagName: string;
		textContent: string;
	}> = {},
): HTMLElement {
	return {
		tagName: overrides.tagName ?? "ARTICLE",
		matches: overrides.matches ?? (() => false),
		querySelector: overrides.querySelector ?? (() => null),
		querySelectorAll: overrides.querySelectorAll ?? (() => []),
		getAttribute: overrides.getAttribute ?? (() => null),
		closest: overrides.closest ?? (() => null),
		contains: overrides.contains ?? (() => false),
		textContent: overrides.textContent ?? "",
	} as unknown as HTMLElement;
}

describe("x parser", () => {
	describe("readPostIdentity", () => {
		it("reads tweet link href as identity", () => {
			const el = makeElement({
				querySelector: (s) => {
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/user/status/123456" : null,
						};
					}
					return null;
				},
			});
			expect(readPostIdentity(el)).toBe("/user/status/123456");
		});

		it("returns null when no tweet link exists", () => {
			const el = makeElement();
			expect(readPostIdentity(el)).toBeNull();
		});

		it("ignores links without /status/ in href", () => {
			const el = makeElement({
				querySelector: (s) => {
					if (s === 'a[href*="/status/"]') {
						return null; // no status link
					}
					return null;
				},
			});
			expect(readPostIdentity(el)).toBeNull();
		});
	});

	describe("extractPostData", () => {
		it("returns null for non-tweet elements", async () => {
			const el = makeElement();
			expect(await extractPostData(el)).toBeNull();
		});

		it("returns null for tweet without text", async () => {
			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === '[data-testid="tweetText"]') return { textContent: "" };
					return null;
				},
			});
			expect(await extractPostData(el)).toBeNull();
		});

		it("extracts tweet data with author handle via querySelector fallback", async () => {
			const textEl = { textContent: "Test tweet content" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					// Tweet text selector must also return element
					if (s === '[data-testid="tweetText"]') {
						return textEl;
					}
					// Match specific selectors by exact string, not includes
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/alice/status/999" : null,
						};
					}
					if (s === '[data-testid="User-Name"]') {
						return {
							// only querySelector, no querySelectorAll (tests the fallback path)
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/alice" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "Alice" };
								}
								return null;
							},
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [textEl];
					if (s === "img") return [];
					return [];
				},
				textContent: "test tweet content",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.post_id).toBe("/alice/status/999");
			expect(result!.text).toBe("test tweet content");
		});

		it("extracts quote tweet as repost node", async () => {
			// Quote wrapper
			const quoteWrapper = {
				role: "link",
				contains: (e: unknown) => e === quoteWrapper || e === quoteTextEl,
			};

			// Text elements
			const mainTextEl = { textContent: "Main tweet" };
			const quoteTextEl = {
				textContent: "Quoted content here",
				closest: () => quoteWrapper,
			};

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					// Quote tweet selector
					if (s === QUOTE_TWEET) {
						return quoteWrapper;
					}
					// Semantic detection: p or a[href*="/status/"]
					if (s === "p") return mainTextEl;
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]')
									return { getAttribute: () => "/bob" };
								if (inner === "span") return { textContent: "Bob" };
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]')
									return [{ getAttribute: () => "/bob" }];
								return [];
							},
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [mainTextEl, quoteTextEl];
					if (s === "img") return [];
					return [];
				},
				contains: (e: unknown) => e === quoteWrapper,
				textContent: "Main tweet Quoted content here",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toContain("main tweet");
			expect(result!.text).toContain("quoted content here");
		});

		it("extracts tweet text when User-Name not found", async () => {
			const textEl = { textContent: "orphan tweet" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === "p") return textEl;
					if (s === '[data-testid="tweetText"]') return textEl;
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [textEl];
					if (s === "img") return [];
					return [];
				},
				textContent: "orphan tweet",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe("orphan tweet");
		});

		// Image attachment extraction
		it("extracts image attachments from tweet", async () => {
			// Create image mock that can be queried inside its container
			const tweetImage = {
				getAttribute: (name: string) => {
					if (name === "src") return "https://pbs.twimg.com/media/ABC123.jpg";
					if (name === "alt") return "Test image";
					return null;
				},
			};

			const photoContainer = {
				querySelector: (sel: string) => {
					if (sel === "img") return tweetImage;
					return null;
				},
			};

			const textEl = { textContent: "Tweet with image" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === '[data-testid="tweetText"]') {
						return textEl;
					}
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/user123" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "User123" };
								}
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return [
										{
											getAttribute: (name: string) =>
												name === "href" ? "/user123" : null,
										},
									];
								}
								return [];
							},
						};
					}
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/user123/status/456" : null,
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [textEl];
					if (s === "img") return [tweetImage];
					if (s === QUOTE_TWEET) return [];
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0]).toEqual({
				kind: "image",
				src: "https://pbs.twimg.com/media/ABC123.jpg",
				alt: "Test image",
				ordinal: 0,
			});
		});

		// Quote tweet using role="link" pattern
		// Real X: <div role="link" tabindex="0"> containing data-testid="tweetText"
		it('extracts quote tweet that uses role="link" pattern', async () => {
			// Quote wrapper for closest() mock
			const quoteWrapper = {
				role: "link",
				contains: (e: unknown) => e === quoteWrapper || e === quoteTextEl,
			};

			// Main and quote text elements
			const mainTextEl = { textContent: "Main tweet text" };
			const quoteTextEl = {
				textContent: "Quoted tweet content",
				closest: () => quoteWrapper,
			};

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					// Quote tweet selector
					if (s === QUOTE_TWEET) {
						return quoteWrapper;
					}
					// First tweet text element (main tweet)
					if (s === '[data-testid="tweetText"]') {
						return mainTextEl;
					}
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/greg" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "Greg" };
								}
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return [
										{
											getAttribute: (name: string) =>
												name === "href" ? "/greg" : null,
										},
									];
								}
								return [];
							},
						};
					}
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/greg/status/789" : null,
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [mainTextEl, quoteTextEl];
					if (s === "img") return [];
					return [];
				},
				contains: (e: unknown) => e === quoteWrapper,
				textContent: "Main tweet text Quoted tweet content",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toContain("main tweet text");
			expect(result!.text).toContain("quoted tweet content");
		});

		// Quote tweet with image attachment
		// Real X HTML: quote tweet has role="link" and contains nested image
		// The image should have node_id='repost-0' not 'root'
		it("extracts quote tweet with image attachment", async () => {
			// Create shared image object
			const quoteTweetImage = {
				getAttribute: (name: string) => {
					if (name === "src") return "https://pbs.twimg.com/media/IMG456.jpg";
					if (name === "alt") return "Screenshot";
					return null;
				},
			};

			// Quote tweet wrapper element (role="link")
			const quoteWrapperEl = {
				querySelector: (inner: string) => {
					if (inner === "img") return quoteTweetImage;
					return null;
				},
				querySelectorAll: (inner: string) => {
					if (inner === "img") return [quoteTweetImage];
					return [];
				},
				contains: (e: unknown) => e === quoteTweetImage || e === quoteTextEl,
			};

			// Main tweet text element
			const mainTextEl = { textContent: "Check this out" };
			// Quote tweet text element
			const quoteTextEl = {
				textContent: "Amazing screenshot attached",
				closest: () => quoteWrapperEl,
			};

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					// Quote tweet selector
					if (s === QUOTE_TWEET) {
						return quoteWrapperEl;
					}
					// First tweet text element (main tweet)
					if (s === '[data-testid="tweetText"]') {
						return mainTextEl;
					}
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/mainuser" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "Main User" };
								}
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return [
										{
											getAttribute: (name: string) =>
												name === "href" ? "/mainuser" : null,
										},
									];
								}
								return [];
							},
						};
					}
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/mainuser/status/111" : null,
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [mainTextEl, quoteTextEl];
					if (s === "img") return [quoteTweetImage];
					return [];
				},
				contains: (e: unknown) => e === quoteWrapperEl,
				textContent: "Check this out Amazing screenshot attached",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toContain("amazing screenshot attached");
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0].kind).toBe("image");
			expect(result!.attachments[0].src).toBe(
				"https://pbs.twimg.com/media/IMG456.jpg",
			);
		});

		it("waits for late media hydration before finalizing attachments", async () => {
			let photoReady = false;

			const lateImage = {
				getAttribute: (name: string) => {
					if (name === "src") return "https://pbs.twimg.com/media/LATE123.jpg";
					if (name === "alt") return "Late image";
					return null;
				},
			};

			const latePhotoContainer = {
				querySelector: (sel: string) => (sel === "img" ? lateImage : null),
				getAttribute: (_name: string) => null,
			};

			const textEl = { textContent: "tweet with late image" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === "p") return textEl;
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/lateuser" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "Late User" };
								}
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return [
										{
											getAttribute: (name: string) =>
												name === "href" ? "/lateuser" : null,
										},
									];
								}
								return [];
							},
						};
					}
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/lateuser/status/999" : null,
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [textEl];
					if (s === "img") return photoReady ? [lateImage] : [];
					return [];
				},
				textContent: "tweet with late image",
			});

			setTimeout(() => {
				photoReady = true;
			}, 10);

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0]).toEqual({
				kind: "image",
				src: "https://pbs.twimg.com/media/LATE123.jpg",
				alt: "Late image",
				ordinal: 0,
			});
		});

		it("extracts image src from background-image when img src is unavailable", async () => {
			const backgroundNode = {
				getAttribute: (name: string) =>
					name === "style"
						? 'filter: brightness(1); background-image: url("https://pbs.twimg.com/media/BG789.jpg?format=jpg&name=small");'
						: null,
			};

			const imgWithBackgroundParent = {
				getAttribute: () => null,
				parentElement: {
					querySelectorAll: (sel: string) =>
						sel === '[style*="background-image"]' ? [backgroundNode] : [],
				},
			};

			const textEl = { textContent: "background image tweet" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === "p") return textEl;
					if (s === '[data-testid="User-Name"]') {
						return {
							querySelector: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return {
										getAttribute: (name: string) =>
											name === "href" ? "/bguser" : null,
									};
								}
								if (inner === "span") {
									return { textContent: "BG User" };
								}
								return null;
							},
							querySelectorAll: (inner: string) => {
								if (inner === 'a[href^="/"]') {
									return [
										{
											getAttribute: (name: string) =>
												name === "href" ? "/bguser" : null,
										},
									];
								}
								return [];
							},
						};
					}
					if (s === 'a[href*="/status/"]') {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/bguser/status/222" : null,
						};
					}
					return null;
				},
				querySelectorAll: (s) => {
					if (s === "p") return [textEl];
					if (s === "img") return [imgWithBackgroundParent];
					return [];
				},
				textContent: "background image tweet",
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([
				{
					kind: "image",
					src: "https://pbs.twimg.com/media/BG789.jpg?format=jpg&name=small",
					alt: "",
					ordinal: 0,
				},
			]);
		});
	});
});

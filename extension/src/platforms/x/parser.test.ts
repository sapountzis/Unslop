import { describe, expect, it } from "bun:test";
import { extractPostData, readPostIdentity } from "./parser";
import { SELECTORS } from "./selectors";

function makeElement(
	overrides: Partial<{
		matches: (s: string) => boolean;
		querySelector: (s: string) => any;
		querySelectorAll: (s: string) => any[];
		getAttribute: (s: string) => string | null;
		closest: (s: string) => any;
		contains: (e: any) => boolean;
	}> = {},
): HTMLElement {
	return {
		matches: overrides.matches ?? (() => false),
		querySelector: overrides.querySelector ?? (() => null),
		querySelectorAll: overrides.querySelectorAll ?? (() => []),
		getAttribute: overrides.getAttribute ?? (() => null),
		closest: overrides.closest ?? (() => null),
		contains: overrides.contains ?? (() => false),
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
					// Tweet text query
					if (s === '[data-testid="tweetText"]') {
						return [textEl];
					}
					// No quote tweets
					if (s === '[data-testid="tweetPhoto"]') {
						return [];
					}
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.post_id).toBe("/alice/status/999");
			expect(result!.author_id).toBe("alice");
			expect(result!.author_name).toBe("Alice");
			expect(result!.nodes[0].text).toBe("test tweet content");
			expect(result!.nodes[0].kind).toBe("root");
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
					if (s === SELECTORS.quoteTweet) {
						return quoteWrapper;
					}
					// First tweet text element (main tweet)
					if (s === '[data-testid="tweetText"]') {
						return mainTextEl;
					}
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
					// Both text elements
					if (s === '[data-testid="tweetText"]') {
						return [mainTextEl, quoteTextEl];
					}
					// No images
					if (s === '[data-testid="tweetPhoto"]') {
						return [];
					}
					return [];
				},
				contains: (e: unknown) => e === quoteWrapper,
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.nodes).toHaveLength(2);
			expect(result!.nodes[0].kind).toBe("root");
			expect(result!.nodes[0].text).toBe("main tweet");
			expect(result!.nodes[1].kind).toBe("repost");
			expect(result!.nodes[1].text).toBe("quoted content here");
		});

		it("returns unknown author when User-Name not found", async () => {
			const textEl = { textContent: "orphan tweet" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === '[data-testid="tweetText"]') return textEl;
					return null;
				},
				querySelectorAll: (s) => {
					if (s === '[data-testid="tweetText"]') return [textEl];
					if (s === '[data-testid="tweetPhoto"]') return [];
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.author_id).toBe("unknown");
			expect(result!.author_name).toBe("Unknown");
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
					// Tweet text query
					if (s === '[data-testid="tweetText"]') {
						return [textEl];
					}
					// Photo containers query
					if (s === '[data-testid="tweetPhoto"]') {
						return [photoContainer];
					}
					// Quote tweet query (none in this test)
					if (s === SELECTORS.quoteTweet) {
						return [];
					}
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0]).toEqual({
				node_id: "root",
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
					if (s === SELECTORS.quoteTweet) {
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
					// Both text elements
					if (s === '[data-testid="tweetText"]') {
						return [mainTextEl, quoteTextEl];
					}
					// No images in this test
					if (s === '[data-testid="tweetPhoto"]') {
						return [];
					}
					return [];
				},
				contains: (e: unknown) => e === quoteWrapper,
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.nodes).toHaveLength(2);
			expect(result!.nodes[0].kind).toBe("root");
			expect(result!.nodes[0].text).toBe("main tweet text");
			expect(result!.nodes[1].kind).toBe("repost");
			expect(result!.nodes[1].text).toBe("quoted tweet content");
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
					if (inner === '[data-testid="tweetPhoto"]') {
						return [
							{
								querySelector: (sel: string) =>
									sel === "img" ? quoteTweetImage : null,
								closest: () => null, // Not inside another quote wrapper
							},
						];
					}
					return [];
				},
				contains: (e: unknown) => {
					// The photo container from main element's querySelectorAll
					// will be checked here - return true to simulate containment
					// Also return true for quoteTextEl
					return (
						(e !== null && typeof e === "object" && "querySelector" in e) ||
						e === quoteTextEl
					);
				},
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
					if (s === SELECTORS.quoteTweet) {
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
					// Both tweet text elements
					if (s === '[data-testid="tweetText"]') {
						return [mainTextEl, quoteTextEl];
					}
					// Photo containers - only quote has one
					if (s === '[data-testid="tweetPhoto"]') {
						return [
							{
								querySelector: (sel: string) =>
									sel === "img" ? quoteTweetImage : null,
								closest: () => quoteWrapperEl, // This container IS inside the quote wrapper
							},
						];
					}
					return [];
				},
				contains: (e: unknown) => e === quoteWrapperEl,
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			// Should have root + repost node
			expect(result!.nodes).toHaveLength(2);
			expect(result!.nodes[1].kind).toBe("repost");
			expect(result!.nodes[1].text).toBe("amazing screenshot attached");
			// Should have image attachment from quote tweet
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0].kind).toBe("image");
			expect(result!.attachments[0].src).toBe(
				"https://pbs.twimg.com/media/IMG456.jpg",
			);
			// CRITICAL: Quote tweet image should have node_id='repost-0', not 'root'
			expect(result!.attachments[0].node_id).toBe("repost-0");
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
					if (s === '[data-testid="tweetText"]') return textEl;
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
					if (s === '[data-testid="tweetText"]') return [textEl];
					if (s === '[data-testid="tweetPhoto"]') {
						return photoReady ? [latePhotoContainer] : [];
					}
					if (s === '[data-testid="tweetPhoto"] img') {
						return photoReady ? [lateImage] : [];
					}
					return [];
				},
			});

			setTimeout(() => {
				photoReady = true;
			}, 10);

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toHaveLength(1);
			expect(result!.attachments[0]).toEqual({
				node_id: "root",
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

			const photoContainer = {
				querySelector: (sel: string) => (sel === "img" ? null : null),
				querySelectorAll: (sel: string) =>
					sel === '[style*="background-image"]' ? [backgroundNode] : [],
				getAttribute: (_name: string) => null,
			};

			const textEl = { textContent: "background image tweet" };

			const el = makeElement({
				matches: (s) => s === 'article[data-testid="tweet"]',
				querySelector: (s) => {
					if (s === '[data-testid="tweetText"]') return textEl;
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
					if (s === '[data-testid="tweetText"]') return [textEl];
					if (s === '[data-testid="tweetPhoto"]') return [photoContainer];
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([
				{
					node_id: "root",
					kind: "image",
					src: "https://pbs.twimg.com/media/BG789.jpg?format=jpg&name=small",
					alt: "",
					ordinal: 0,
				},
			]);
		});
	});
});

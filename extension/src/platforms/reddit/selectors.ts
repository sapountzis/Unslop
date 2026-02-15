// Reddit DOM selectors
// Supports new Reddit (shreddit web components) and classic new Reddit

export const SELECTORS = {
	// Feed container
	feed: 'shreddit-feed, [data-testid="posts-list"], .rpBJOHq2PR60pnwJlUyP0, #siteTable',

	// Post container — new Reddit uses shreddit-post, classic uses article or div.Post
	candidatePostRoot:
		'shreddit-post, article[data-testid="post-container"], .Post, .thing.link',
	renderPostRoot:
		'shreddit-post, article[data-testid="post-container"], .Post, .thing.link',

	// Post title
	postTitle:
		'[slot="title"], h3[data-testid="post-title"], [data-testid="post-title"], h2 a, a.title',

	// Post body text
	postBody:
		'[slot="text-body"], [data-testid="post-body"], .RichTextJSON-root, .usertext-body',

	// Author
	authorName: '[data-testid="post-author"], a[href*="/user/"], .author',

	// Images
	imageNodes:
		'[slot="post-media-container"] img, [data-testid="post-media"] img, .ImageBox-image, a.thumbnail img',

	// Flair
	flair: 'shreddit-post-flair, [data-testid="flair"], .flair',

	// Subreddit
	subredditName: '[data-testid="subreddit-name"], a[href^="/r/"]',
} as const;

// Reddit DOM selectors
// Supports new Reddit (shreddit web components) and classic new Reddit

export const SELECTORS = {
	// Feed container
	feed: 'shreddit-feed, [data-testid="posts-list"], .rpBJOHq2PR60pnwJlUyP0, #siteTable',

	// Post container — new Reddit uses shreddit-post/shreddit-ad-post, classic uses article or div.Post
	candidatePostRoot:
		'shreddit-post, shreddit-ad-post, article[data-testid="post-container"], .Post, .thing.link',
	renderPostRoot:
		'article[data-post-id], article[data-testid="post-container"], shreddit-post, shreddit-ad-post, .Post, .thing.link',

	// Post title
	postTitle:
		'[slot="title"], [post-title], h3[data-testid="post-title"], [data-testid="post-title"], h2 a, a.title',

	// Post body text
	postBody:
		'[slot="text-body"], [id$="-post-rtjson-content"], [data-testid="post-body"], .RichTextJSON-root, .usertext-body',

	// Author
	authorName: '[data-testid="post-author"], a[href*="/user/"], .author',

	// Images
	imageNodes:
		'[slot="post-media-container"] img, gallery-carousel img, [data-testid="post-media"] img, .ImageBox-image, a.thumbnail img',

	// Flair
	flair: 'shreddit-post-flair, [data-testid="flair"], .flair',

	// Subreddit
	subredditName:
		'[subreddit-name], [data-testid="subreddit-name"], a[href^="/r/"]',

	permalinkLink: 'a[href*="/comments/"]',
} as const;

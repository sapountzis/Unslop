// Shared types for the content pipeline.

export type DetectedSurface = {
	/** Element passed to platform.extractPostData() */
	contentRoot: HTMLElement;
	/** Element that receives hide/collapse styling */
	renderRoot: HTMLElement;
	/** Element that receives the decision label (may equal renderRoot) */
	labelRoot: HTMLElement;
	/** Stable identity string for deduplication */
	identity: string;
};

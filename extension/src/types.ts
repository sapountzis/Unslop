// extension/src/types.ts
export type Decision = "keep" | "hide";
export type Source = "llm" | "cache" | "error";

export interface ProviderSettings {
	apiKey: string;
	baseUrl: string;
	model: string;
}

export interface DecisionCounts {
	keep: number;
	hide: number;
	total: number;
}

export interface LocalStatsDay extends DecisionCounts {
	date: string;
}

export interface LocalStatsSnapshot {
	today: DecisionCounts;
	last30Days: DecisionCounts;
	allTime: DecisionCounts;
	dailyBreakdown: LocalStatsDay[];
}

export interface Storage {
	enabled?: boolean;
	hideRenderMode?: "collapse" | "label";
	decisionCache?: Record<string, CachedDecision>;
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

export interface CachedDecision {
	decision: Decision;
	source: Source;
	timestamp: number;
}

export interface ImageAttachmentRef {
	kind: "image";
	src: string;
	alt: string;
	ordinal?: number;
}

export interface ResolvedImageAttachment {
	kind: "image";
	ordinal?: number;
	sha256: string;
	mime_type: string;
	base64: string;
}

export type ImageAttachment = ImageAttachmentRef | ResolvedImageAttachment;

export interface PdfAttachmentRef {
	kind: "pdf";
	source_url?: string;
	iframe_src?: string;
	container_data_url?: string;
	source_hint?: string;
	ordinal?: number;
	excerpt_text?: string;
}

export interface ResolvedPdfAttachment {
	kind: "pdf";
	ordinal?: number;
	source_url: string;
	excerpt_text: string;
}

export type PdfAttachment = PdfAttachmentRef | ResolvedPdfAttachment;

export type PostAttachment = ImageAttachment | PdfAttachment;

export interface PostData {
	post_id: string;
	text: string;
	attachments: PostAttachment[];
}

export interface BatchClassifyRequest {
	posts: PostData[];
}

export interface BatchClassifyResult {
	post_id: string;
	decision?: Decision;
	source?: Source;
}

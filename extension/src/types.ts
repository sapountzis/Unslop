// extension/src/types.ts
export type Decision = "keep" | "hide";
export type Source = "llm" | "cache" | "error";

export interface Storage {
	jwt?: string;
	enabled?: boolean;
	hideRenderMode?: "collapse" | "label";
	decisionCache?: Record<string, CachedDecision>;
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
	error?: "quota_exceeded";
}

export interface UserInfo {
	user_id: string;
	email: string;
	plan: "free" | "pro";
	plan_status: "active" | "inactive";
}

export interface UserInfoWithUsage extends UserInfo {
	current_usage?: number;
	limit?: number;
	remaining?: number;
	reset_date?: string;
}

export interface UsageInfo {
	current_usage: number;
	limit: number;
	remaining: number;
	plan: "free" | "pro";
	plan_status: "active" | "inactive";
	reset_date: string;
}

export interface StatsInfo {
	all_time: { keep: number; hide: number; total: number };
	last_30_days: { keep: number; hide: number; total: number };
	today: { keep: number; hide: number; total: number };
	daily_breakdown: { date: string; decision: string; count: number }[];
}

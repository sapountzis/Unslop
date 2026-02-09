// extension/src/types.ts
export type Decision = 'keep' | 'dim' | 'hide';
export type Source = 'llm' | 'cache' | 'error';

export interface Storage {
  jwt?: string;
  enabled?: boolean;
  hideRenderMode?: 'collapse' | 'stub';
  decisionCache?: Record<string, CachedDecision>;
}

export interface CachedDecision {
  decision: Decision;
  source: Source;
  timestamp: number;
}

export interface PostNode {
  id: string;
  parent_id: string | null;
  kind: 'root' | 'repost';
  text: string;
}

export interface ImageAttachmentRef {
  node_id: string;
  kind: 'image';
  src: string;
  alt: string;
  ordinal: number;
}

export interface ResolvedImageAttachment {
  node_id: string;
  kind: 'image';
  sha256: string;
  mime_type: string;
  base64: string;
}

export type ImageAttachment = ImageAttachmentRef | ResolvedImageAttachment;

export interface PdfAttachmentRef {
  node_id: string;
  kind: 'pdf';
  source_url?: string;
  iframe_src?: string;
  container_data_url?: string;
  source_hint?: string;
  ordinal: number;
  excerpt_text?: string;
}

export interface ResolvedPdfAttachment {
  node_id: string;
  kind: 'pdf';
  source_url: string;
  excerpt_text: string;
}

export type PdfAttachment = PdfAttachmentRef | ResolvedPdfAttachment;

export type PostAttachment = ImageAttachment | PdfAttachment;

export interface PostData {
  post_id: string;
  author_id: string;
  author_name: string;
  nodes: PostNode[];
  attachments: PostAttachment[];
}

export interface BatchClassifyRequest {
  posts: PostData[];
}

export interface BatchClassifyResult {
  post_id: string;
  decision?: Decision;
  source?: Source;
  error?: 'quota_exceeded';
}

export interface UserInfo {
  user_id: string;
  email: string;
  plan: 'free' | 'pro';
  plan_status: 'active' | 'inactive';
}

export interface UsageInfo {
  current_usage: number;
  limit: number;
  remaining: number;
  plan: 'free' | 'pro';
  plan_status: 'active' | 'inactive';
  reset_date: string;
}

export interface StatsInfo {
  all_time: { keep: number; dim: number; hide: number; total: number };
  last_30_days: { keep: number; dim: number; hide: number; total: number };
  today: { keep: number; dim: number; hide: number; total: number };
  daily_breakdown: { date: string; decision: string; count: number }[];
}

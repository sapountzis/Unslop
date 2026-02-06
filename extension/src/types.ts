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

export interface PostData {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
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

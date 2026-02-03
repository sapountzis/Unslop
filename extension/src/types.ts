// extension/src/types.ts
export type Decision = 'keep' | 'dim' | 'hide';
export type Source = 'llm' | 'cache' | 'error';
export type UserLabel = 'should_keep' | 'should_hide';

export interface Storage {
  jwt?: string;
  enabled: boolean;
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

export interface ClassifyRequest {
  post: PostData;
}

export interface ClassifyResponse {
  post_id: string;
  decision: Decision;
  source: Source;
}

export interface UserInfo {
  user_id: string;
  email: string;
  plan: 'free' | 'pro';
  plan_status: 'active' | 'inactive';
}

export interface FeedbackRequest {
  post_id: string;
  rendered_decision: Decision;
  user_label: UserLabel;
}

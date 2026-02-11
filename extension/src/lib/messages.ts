import {
  BatchClassifyResult,
  PostData,
  StatsInfo,
  UsageInfo,
  UserInfo,
} from '../types';

export const MESSAGE_TYPES = {
  CLASSIFY_BATCH: 'CLASSIFY_BATCH',
  CLASSIFY_BATCH_RESULT: 'CLASSIFY_BATCH_RESULT',
  GET_USER_INFO: 'GET_USER_INFO',
  CREATE_CHECKOUT: 'CREATE_CHECKOUT',
  START_AUTH: 'START_AUTH',
  SET_JWT: 'SET_JWT',
  CLEAR_JWT: 'CLEAR_JWT',
  TOGGLE_ENABLED: 'TOGGLE_ENABLED',
  RELOAD_ACTIVE_TAB: 'RELOAD_ACTIVE_TAB',
  GET_USAGE: 'GET_USAGE',
  GET_STATS: 'GET_STATS',
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

export type ClassifyBatchMessage = {
  type: typeof MESSAGE_TYPES.CLASSIFY_BATCH;
  posts: PostData[];
};

export type ClassifyBatchResultMessage = {
  type: typeof MESSAGE_TYPES.CLASSIFY_BATCH_RESULT;
  item: BatchClassifyResult;
};

export type GetUserInfoMessage = {
  type: typeof MESSAGE_TYPES.GET_USER_INFO;
};

export type CreateCheckoutMessage = {
  type: typeof MESSAGE_TYPES.CREATE_CHECKOUT;
};

export type StartAuthMessage = {
  type: typeof MESSAGE_TYPES.START_AUTH;
  email: string;
};

export type SetJwtMessage = {
  type: typeof MESSAGE_TYPES.SET_JWT;
  jwt: string;
};

export type ClearJwtMessage = {
  type: typeof MESSAGE_TYPES.CLEAR_JWT;
};

export type ToggleEnabledMessage = {
  type: typeof MESSAGE_TYPES.TOGGLE_ENABLED;
};

export type ReloadActiveTabMessage = {
  type: typeof MESSAGE_TYPES.RELOAD_ACTIVE_TAB;
  tabId: number;
};

export type GetUsageMessage = {
  type: typeof MESSAGE_TYPES.GET_USAGE;
};

export type GetStatsMessage = {
  type: typeof MESSAGE_TYPES.GET_STATS;
};

export type RuntimeRequest =
  | ClassifyBatchMessage
  | GetUserInfoMessage
  | CreateCheckoutMessage
  | StartAuthMessage
  | SetJwtMessage
  | ClearJwtMessage
  | ToggleEnabledMessage
  | ReloadActiveTabMessage
  | GetUsageMessage
  | GetStatsMessage;

export type RuntimeResponseByType = {
  [MESSAGE_TYPES.CLASSIFY_BATCH]: { status: 'ok' | 'disabled' | 'error' };
  [MESSAGE_TYPES.CLASSIFY_BATCH_RESULT]: undefined;
  [MESSAGE_TYPES.GET_USER_INFO]: UserInfo | null;
  [MESSAGE_TYPES.CREATE_CHECKOUT]: { checkout_url: string | null };
  [MESSAGE_TYPES.START_AUTH]: { status: 'ok' };
  [MESSAGE_TYPES.SET_JWT]: { status: 'ok' };
  [MESSAGE_TYPES.CLEAR_JWT]: { status: 'ok' };
  [MESSAGE_TYPES.TOGGLE_ENABLED]: { enabled: boolean };
  [MESSAGE_TYPES.RELOAD_ACTIVE_TAB]: { status: 'reloaded' | 'ignored' };
  [MESSAGE_TYPES.GET_USAGE]: UsageInfo | null;
  [MESSAGE_TYPES.GET_STATS]: StatsInfo | null;
};

export type RuntimeResponse<T extends MessageType> = RuntimeResponseByType[T];

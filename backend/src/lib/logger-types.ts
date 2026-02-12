export type LogMeta = Record<string, unknown>;

export interface AppLogger {
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, error: unknown, meta?: LogMeta) => void;
}

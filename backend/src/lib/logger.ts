type Meta = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(token|authorization|password|secret|api[_-]?key|cookie|jwt|session)/i;
const MAX_DEPTH = 4;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[truncated]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeValue(nestedValue, depth + 1);
      }
    }

    return sanitized;
  }

  return value;
}

function writeLog(level: 'info' | 'warn' | 'error', message: string, payload: Meta = {}): void {
  const sanitizedPayload = sanitizeValue(payload) as Meta;
  const event = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...sanitizedPayload,
  };

  const line = `${JSON.stringify(event)}\n`;
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  info: (message: string, meta: Meta = {}) => {
    writeLog('info', message, meta);
  },
  warn: (message: string, meta: Meta = {}) => {
    writeLog('warn', message, meta);
  },
  error: (message: string, error: unknown, meta: Meta = {}) => {
    writeLog('error', message, {
      ...meta,
      error,
    });
  },
};

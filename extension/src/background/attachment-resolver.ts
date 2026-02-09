import {
  BatchClassifyRequest,
  ResolvedImageAttachment,
  PdfAttachment,
  ResolvedPdfAttachment,
  PostAttachment,
  PostData,
} from '../types';

export const MAX_IMAGE_BYTES = 2_000_000;
export const MAX_PDF_FETCH_BYTES = 150_000;
export const MAX_PDF_EXCERPT_CHARS = 2_000;

type PostDataLike = Omit<PostData, 'attachments'> & {
  attachments?: unknown[];
};

export type BatchClassifyRequestLike = {
  posts: PostDataLike[];
};

export type AttachmentResolverDependencies = {
  fetch?: typeof fetch;
  maxImageBytes?: number;
  maxPdfFetchBytes?: number;
  maxPdfExcerptChars?: number;
};

type AttachmentBudgets = {
  maxImageBytes: number;
  maxPdfFetchBytes: number;
  maxPdfExcerptChars: number;
};

export async function resolveBatchAttachmentPayload(
  request: BatchClassifyRequestLike,
  dependencies: AttachmentResolverDependencies = {}
): Promise<BatchClassifyRequest> {
  const budgets = resolveBudgets(dependencies);
  const resolvedPosts: PostData[] = [];

  for (const post of request.posts) {
    const resolvedAttachments: PostAttachment[] = [];

    for (const attachment of post.attachments ?? []) {
      try {
        const resolved = await resolveAttachment(attachment, dependencies, budgets);
        if (resolved) {
          resolvedAttachments.push(resolved);
        }
      } catch {
        // Fail-open: skip broken attachments and keep processing the post.
      }
    }

    resolvedPosts.push({
      post_id: post.post_id,
      author_id: post.author_id,
      author_name: post.author_name,
      nodes: post.nodes,
      attachments: resolvedAttachments,
    });
  }

  return { posts: resolvedPosts };
}

function resolveBudgets(dependencies: AttachmentResolverDependencies): AttachmentBudgets {
  return {
    maxImageBytes: dependencies.maxImageBytes ?? MAX_IMAGE_BYTES,
    maxPdfFetchBytes: dependencies.maxPdfFetchBytes ?? MAX_PDF_FETCH_BYTES,
    maxPdfExcerptChars: dependencies.maxPdfExcerptChars ?? MAX_PDF_EXCERPT_CHARS,
  };
}

async function resolveAttachment(
  attachment: unknown,
  dependencies: AttachmentResolverDependencies,
  budgets: AttachmentBudgets
): Promise<PostAttachment | null> {
  if (isResolvedImageAttachment(attachment)) {
    return attachment;
  }

  if (isResolvedPdfAttachment(attachment)) {
    return {
      ...attachment,
      excerpt_text: truncateText(attachment.excerpt_text, budgets.maxPdfExcerptChars),
    };
  }

  const record = asRecord(attachment);
  if (!record) {
    return null;
  }

  const nodeId = readString(record, ['node_id']);
  if (!nodeId) {
    return null;
  }

  const kind = normalizeKind(readString(record, ['kind', 'type']));
  if (kind === 'image') {
    return resolveImageAttachment(record, nodeId, dependencies, budgets);
  }
  if (kind === 'pdf') {
    return resolvePdfAttachment(record, nodeId, dependencies, budgets);
  }

  return null;
}

async function resolveImageAttachment(
  record: Record<string, unknown>,
  nodeId: string,
  dependencies: AttachmentResolverDependencies,
  budgets: AttachmentBudgets
): Promise<ResolvedImageAttachment | null> {
  const sourceUrl = readHttpUrl(record, ['source_url', 'src', 'url', 'href', 'image_url']);
  if (!sourceUrl) {
    return null;
  }

  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return null;
  }

  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(`image_fetch_failed:${response.status}`);
  }

  const bytes = await readBytesWithinBudget(response, budgets.maxImageBytes);
  const sha256 = await sha256Hex(bytes);
  const mimeType = normalizeMimeType(
    response.headers.get('content-type') ?? readString(record, ['mime_type']) ?? undefined
  );

  return {
    node_id: nodeId,
    kind: 'image',
    sha256,
    mime_type: mimeType,
    base64: toBase64(bytes),
  };
}

async function resolvePdfAttachment(
  record: Record<string, unknown>,
  nodeId: string,
  dependencies: AttachmentResolverDependencies,
  budgets: AttachmentBudgets
): Promise<PdfAttachment | null> {
  const sourceUrl = readHttpUrl(record, [
    'source_url',
    'src',
    'url',
    'href',
    'document_url',
    'iframe_src',
    'container_data_url',
    'source_hint',
  ]);
  if (!sourceUrl) {
    return null;
  }

  const inlineExcerpt = truncateText(
    readString(record, ['excerpt_text', 'excerpt', 'text_hint']) ?? '',
    budgets.maxPdfExcerptChars
  );
  if (inlineExcerpt.length > 0) {
    return {
      node_id: nodeId,
      kind: 'pdf',
      source_url: sourceUrl,
      excerpt_text: inlineExcerpt,
    };
  }

  const excerpt = await extractPdfExcerptBestEffort(sourceUrl, dependencies, budgets);
  return {
    node_id: nodeId,
    kind: 'pdf',
    source_url: sourceUrl,
    excerpt_text: excerpt,
  };
}

async function extractPdfExcerptBestEffort(
  sourceUrl: string,
  dependencies: AttachmentResolverDependencies,
  budgets: AttachmentBudgets
): Promise<string> {
  try {
    const fetchImpl = dependencies.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      return '';
    }

    const response = await fetchImpl(sourceUrl);
    if (!response.ok) {
      return '';
    }

    const mimeType = normalizeMimeType(response.headers.get('content-type') ?? undefined);
    if (mimeType === 'application/pdf') {
      // No parser here; keep source URL and fail-open with empty excerpt.
      return '';
    }

    if (!isTextLikeMimeType(mimeType)) {
      return '';
    }

    const bytes = await readBytesWithinBudget(response, budgets.maxPdfFetchBytes);
    const decoded = new TextDecoder().decode(bytes);
    return truncateText(decoded, budgets.maxPdfExcerptChars);
  } catch {
    return '';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readHttpUrl(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    const normalized = normalizeHttpUrl(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeKind(kind: string | null): 'image' | 'pdf' | null {
  if (!kind) {
    return null;
  }
  if (kind === 'image' || kind === 'image_ref') {
    return 'image';
  }
  if (kind === 'pdf' || kind === 'pdf_ref' || kind === 'document') {
    return 'pdf';
  }
  return null;
}

function normalizeMimeType(mimeType: string | undefined): string {
  if (!mimeType) {
    return 'application/octet-stream';
  }
  const normalized = mimeType.split(';', 1)[0]?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : 'application/octet-stream';
}

function isTextLikeMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/xhtml+xml'
  );
}

function truncateText(text: string, maxChars: number): string {
  if (text.length === 0) {
    return '';
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

async function readBytesWithinBudget(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error('attachment_too_large');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('attachment_too_large');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa !== 'function') {
    throw new Error('base64_unavailable');
  }
  return btoa(binary);
}

function isResolvedImageAttachment(value: unknown): value is ResolvedImageAttachment {
  const record = asRecord(value);
  return Boolean(
    record &&
    record.kind === 'image' &&
    typeof record.node_id === 'string' &&
    typeof record.sha256 === 'string' &&
    typeof record.mime_type === 'string' &&
    typeof record.base64 === 'string'
  );
}

function isResolvedPdfAttachment(value: unknown): value is ResolvedPdfAttachment {
  const record = asRecord(value);
  return Boolean(
    record &&
    record.kind === 'pdf' &&
    typeof record.node_id === 'string' &&
    typeof record.source_url === 'string' &&
    typeof record.excerpt_text === 'string'
  );
}

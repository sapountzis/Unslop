// extension/src/content/batch-queue.js
import { BATCH_MAX_ITEMS, BATCH_WINDOW_MS } from '../lib/config';
const pending = new Map();
const queue = [];
let flushTimer = null;
let flushing = false;
function scheduleFlush() {
    if (flushTimer !== null)
        return;
    flushTimer = window.setTimeout(() => {
        flushTimer = null;
        flush().catch((err) => console.error('Batch flush failed:', err));
    }, BATCH_WINDOW_MS);
}
function failBatch(posts) {
    for (const post of posts) {
        const entry = pending.get(post.post_id);
        if (!entry)
            continue;
        entry.resolve({ decision: 'keep', source: 'error' });
        pending.delete(post.post_id);
    }
}
async function flush() {
    if (flushing)
        return;
    flushing = true;
    if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
    }
    try {
        while (queue.length > 0) {
            const batch = queue.splice(0, BATCH_MAX_ITEMS);
            const response = await chrome.runtime.sendMessage({
                type: 'CLASSIFY_BATCH',
                posts: batch,
            });
            if (!response || response.status !== 'ok') {
                failBatch(batch);
            }
        }
    }
    finally {
        flushing = false;
    }
}
export function enqueueBatch(post) {
    const existing = pending.get(post.post_id);
    if (existing)
        return existing.promise;
    let resolve;
    const promise = new Promise((resolver) => {
        resolve = resolver;
    });
    pending.set(post.post_id, { promise, resolve });
    queue.push(post);
    if (queue.length >= BATCH_MAX_ITEMS) {
        flush().catch((err) => console.error('Batch flush failed:', err));
    }
    else {
        scheduleFlush();
    }
    return promise;
}
export function handleBatchResult(item) {
    const entry = pending.get(item.post_id);
    if (!entry)
        return;
    if (item.error === 'quota_exceeded' || !item.decision || !item.source) {
        entry.resolve({ decision: 'keep', source: 'error' });
        pending.delete(item.post_id);
        return;
    }
    entry.resolve({ decision: item.decision, source: item.source });
    pending.delete(item.post_id);
}

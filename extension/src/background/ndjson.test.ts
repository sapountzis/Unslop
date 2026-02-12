// extension/src/background/ndjson.test.ts
import { describe, it, expect } from 'bun:test';
import { parseNdjson } from './ndjson';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of parseNdjson<T>(stream)) {
    out.push(item);
  }
  return out;
}

describe('parseNdjson', () => {
  it('parses a single line', async () => {
    const items = await collect<{ a: number }>(streamFromChunks(['{"a":1}\n']));
    expect(items).toEqual([{ a: 1 }]);
  });

  it('parses multiple lines in one chunk', async () => {
    const items = await collect(streamFromChunks(['{"a":1}\n{"b":2}\n']));
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('parses a line split across chunks', async () => {
    const items = await collect(streamFromChunks(['{"a":', '1}\n{"b":2}\n']));
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

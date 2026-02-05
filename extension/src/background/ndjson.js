// extension/src/background/ndjson.js

export async function* parseNdjson(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      yield JSON.parse(trimmed);
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail) {
    yield JSON.parse(tail);
  }
}

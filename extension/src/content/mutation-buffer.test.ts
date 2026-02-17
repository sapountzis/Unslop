import { describe, expect, it } from "bun:test";
import { createMutationBuffer } from "./mutation-buffer";

describe("mutation buffer", () => {
	it("deduplicates same element and flushes once", () => {
		const seen: string[] = [];
		const buffer = createMutationBuffer((el) => seen.push(el.id));
		const el = { id: "a" } as HTMLElement;
		buffer.enqueue(el);
		buffer.enqueue(el);
		buffer.flushNow();
		expect(seen).toEqual(["a"]);
	});
});

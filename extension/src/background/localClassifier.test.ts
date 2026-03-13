// extension/src/background/localClassifier.test.ts
import { describe, expect, it } from "bun:test";
import { streamLocalClassifyBatch, classifySinglePost } from "./localClassifier";
import type { ProviderSettings } from "./llmClient";
import type { BatchClassifyResult, PostData } from "../types";

function makePost(id: string): PostData {
    return { post_id: id, text: `Post text for ${id}`, attachments: [] };
}

const fakeSettings: ProviderSettings = {
    apiKey: "sk-test",
    baseUrl: "https://api.openai.com",
    model: "gpt-4.1-mini",
};

describe("streamLocalClassifyBatch", () => {
    it("emits results for each post", async () => {
        const results: BatchClassifyResult[] = [];

        await streamLocalClassifyBatch(
            [makePost("a"), makePost("b")],
            fakeSettings,
            (item) => results.push(item),
            {
                classifySingleFn: async (_settings, post) => ({
                    post_id: post.post_id,
                    decision: "keep",
                    source: "llm",
                }),
            },
        );

        expect(results).toHaveLength(2);
        expect(results.map((r) => r.post_id).sort()).toEqual(["a", "b"]);
        expect(results[0].decision).toBe("keep");
    });

    it("returns empty immediately for empty post list", async () => {
        const results: BatchClassifyResult[] = [];
        await streamLocalClassifyBatch([], fakeSettings, (item) => results.push(item));
        expect(results).toHaveLength(0);
    });

    it("emits fail-open results when classify throws", async () => {
        const results: BatchClassifyResult[] = [];

        await streamLocalClassifyBatch(
            [makePost("x"), makePost("y")],
            fakeSettings,
            (item) => results.push(item),
            {
                classifySingleFn: async (_settings, post) => {
                    // Simulate error → fail-open (no decision)
                    return { post_id: post.post_id };
                },
            },
        );

        expect(results).toHaveLength(2);
        for (const r of results) {
            expect(r.decision).toBeUndefined();
        }
    });
});

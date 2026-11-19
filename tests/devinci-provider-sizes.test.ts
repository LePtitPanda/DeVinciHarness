import { test } from "node:test";
import assert from "node:assert/strict";
import type { Api, Model } from "@earendil-works/pi-ai";
import { mergeNvidiaModels, nvidiaModels, refreshNvidiaModels, resetNvidiaModels, NVIDIA_DEFAULT_CONTEXT } from "../src/agent/nvidia-live.ts";
import { customDefaultSizes, CUSTOM_MODEL_DEFAULT_CONTEXT_WINDOW, CUSTOM_REMOTE_DEFAULT_CONTEXT_WINDOW } from "../src/core/settings.ts";

const bundled = [
	{ id: "deepseek-ai/deepseek-v4.1-flash", name: "DeepSeek", api: "openai-completions", provider: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1", reasoning: true, input: ["text"], contextWindow: 200_000, maxTokens: 8_000 },
	{ id: "z-ai/glm-5.3-flash", name: "GLM", api: "openai-completions", provider: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1", reasoning: true, input: ["text"], contextWindow: 128_000, maxTokens: 8_000 },
] as unknown as Model<Api>[];

test("nvidia: live list replaces the bundled one; retired models vanish, new ones get large sizes", () => {
	const merged = mergeNvidiaModels(bundled, ["moonshotai/kimi-k3.1-pro", "z-ai/glm-5.3-flash", "nvidia/nemotron-3.5-embed-1b", "nvidia/llama-3.1-nemoguard-8b-topic-control"]);
	assert.deepEqual(merged.map((m) => m.id), ["moonshotai/kimi-k3.1-pro", "z-ai/glm-5.3-flash"]);
	assert.equal(merged[1], bundled[1], "known models keep their bundled metadata");
	assert.equal(merged[0]!.contextWindow, NVIDIA_DEFAULT_CONTEXT);
	assert.equal(merged[0]!.reasoning, false);
	assert.equal(merged[0]!.provider, "nvidia");
});

test("nvidia: refresh uses the key, keeps the bundled list on failure", async () => {
	resetNvidiaModels();
	let auth = "";
	await refreshNvidiaModels(bundled, undefined, async () => { throw new Error("no key: must not fetch"); });
	assert.equal(nvidiaModels(bundled), bundled);
	await refreshNvidiaModels(bundled, "nvapi-x", async () => new Response("nope", { status: 401 }));
	assert.equal(nvidiaModels(bundled), bundled);
	await refreshNvidiaModels(bundled, "nvapi-x", async (_url, init) => {
		auth = new Headers(init?.headers).get("authorization") ?? "";
		return Response.json({ data: [{ id: "moonshotai/kimi-k3.1-pro" }] });
	});
	assert.equal(auth, "Bearer nvapi-x");
	assert.deepEqual(nvidiaModels(bundled).map((m) => m.id), ["moonshotai/kimi-k3.1-pro"]);
	resetNvidiaModels();
});

test("custom endpoints: cloud URLs default large, local servers keep 8k", () => {
	assert.equal(customDefaultSizes("https://integrate.api.nvidia.com/v1").context, CUSTOM_REMOTE_DEFAULT_CONTEXT_WINDOW);
	for (const url of ["http://localhost:11434/v1", "http://127.0.0.1:1234/v1", "https://192.168.1.20/v1", "https://box.local/v1", "http://example.com/v1"]) {
		assert.equal(customDefaultSizes(url).context, CUSTOM_MODEL_DEFAULT_CONTEXT_WINDOW, url);
	}
});

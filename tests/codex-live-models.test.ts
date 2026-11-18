import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
const require = createRequire(import.meta.url);
const { codexLiveModels } = require("../electron/subscriptions.cjs");

test("codex live list adds only unknown, listed models, cloned from the closest bundled model", () => {
	const bundled = openaiCodexProvider().getModels();
	const live = codexLiveModels(bundled, [
		{ slug: "gpt-6.1-sol", visibility: "list", display_name: "dup" },
		{ slug: "gpt-6.2-nova", visibility: "list", display_name: "GPT-6.2 Nova", context_window: 400000 },
		{ slug: "gpt-internal", visibility: "hide", display_name: "hidden" },
		{ slug: "bad slug!", visibility: "list" },
		null,
	]);
	assert.deepEqual(live.map((m: { id: string }) => m.id), ["gpt-6.2-nova"]);
	assert.equal(live[0].name, "GPT-6.2 Nova");
	assert.equal(live[0].contextWindow, 400000);
	assert.equal(live[0].api, "openai-codex-responses");
	assert.equal(live[0].provider, "openai-codex");
	assert.ok(live[0].baseUrl);
	assert.deepEqual(codexLiveModels(bundled, undefined), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isImportedOnly } from "../components/graph-view.tsx";

test("a node is imported-only until some chat covers it", () => {
	const snapshot = {
		sessions: { chat_1: "Linear algebra" },
		fileSources: { src_1: "cours.pdf" },
		nodeSessions: { a: ["src_1"], b: ["src_1", "chat_1"], c: ["chat_1"], d: [] },
	};
	assert.equal(isImportedOnly(snapshot, "a"), true);
	assert.equal(isImportedOnly(snapshot, "b"), false);
	assert.equal(isImportedOnly(snapshot, "c"), false);
	assert.equal(isImportedOnly(snapshot, "d"), false);
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { absorbedNarration, isNarration, narrationHost } from "../components/narration.ts";

describe("narration folding (fork)", () => {
	const parts = [
		{ type: "step-start" },
		{ type: "reasoning", text: "plan" },
		{ type: "text", text: "I'll read the course first." },
		{ type: "tool-school_read_file" },
		{ type: "step-start" },
		{ type: "text", text: "Checking your sessions." },
		{ type: "tool-list_sessions" },
		{ type: "step-start" },
		{ type: "text", text: "We'll study series of functions." },
		{ type: "tool-probe" },
		{ type: "step-start" },
		{ type: "text", text: "Final answer." },
	];
	it("folds text before a non-question tool, keeps text before a probe and final text", () => {
		assert.deepEqual(parts.map((_, i) => isNarration(parts, i)), [false, false, true, false, false, true, false, false, false, false, false, false]);
	});
	it("hands narration to the step's thinking block when there is one", () => {
		assert.equal(narrationHost(parts, 2), 1);
		assert.equal(narrationHost(parts, 5), -1);
		assert.deepEqual(absorbedNarration(parts, 1), ["I'll read the course first."]);
	});
});

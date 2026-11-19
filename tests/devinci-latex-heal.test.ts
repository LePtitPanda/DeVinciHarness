import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { escapeLatexBackslashes, healEncodedArguments } from "../src/core/argument-heal.ts";

const schema = { properties: { question: { type: "string" }, options: { type: "array" } } } as never;

test("heal: a JSON-encoded options array holding LaTeX (real Nemotron call) becomes an array", () => {
	const raw = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "latex-options-string.txt"), "utf8");
	assert.throws(() => JSON.parse(raw), "the model's string is invalid JSON as sent");
	const healed = healEncodedArguments({ question: "q", options: raw }, schema) as { options: { label: string }[] };
	assert.ok(Array.isArray(healed.options) && healed.options.length >= 2);
	assert.match(healed.options[0]!.label, /\$\]0, \+\\infty\[\$/);
});

test("heal: LaTeX commands that look like JSON escapes stay LaTeX; real escapes stay escapes", () => {
	const parsed = JSON.parse(escapeLatexBackslashes(String.raw`["$\frac{1}{n}$ \times $\nabla f$", "ligne 1\nQuelle", "$\beta$ \"ok\" \\ é \infty"]`));
	assert.deepEqual(parsed, [String.raw`$\frac{1}{n}$ \times $\nabla f$`, "ligne 1\nQuelle", String.raw`$\beta$ "ok" \ é \infty`]);
});

test("heal: well-formed arguments are untouched", () => {
	const args = { question: "q", options: [{ label: "a" }, { label: "b" }] };
	assert.equal(healEncodedArguments(args, schema), args);
});

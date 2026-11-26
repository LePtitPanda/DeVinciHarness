import assert from "node:assert/strict";
import { test } from "node:test";
import { listSourceSegments } from "../src/agent/prompt-segments.ts";
import { composeInstructions, createChatAgent } from "../src/agent/teacher-agent.ts";

test("chat sessions compose their own prompt, without the teaching base or question mechanics", () => {
	const paths = listSourceSegments("chat").map((s) => s.path);
	assert(paths.includes("chat/00-base.md"));
	assert(!paths.includes("system-prompt.md"));
	assert(!paths.some((p) => p.startsWith("teacher/") || p === "shared/20-question-tools.md"));
	assert(composeInstructions("chat").includes("Chat session"));
});

test("the chat agent carries files and jobs, never quiz, plan, problem or probe tools", () => {
	const agent = createChatAgent({ chatId: "chat_fixture", jobStore: {} as never, spawn: () => {}, searchAvailable: () => false }, {
		engine: { model: { api: "faux", provider: "faux", id: "faux-model", contextWindow: 8192 } as never, streamFn: (async () => { throw new Error("not streamed"); }) as never },
	});
	const names = agent.state.tools.map((t: { name: string }) => t.name);
	for (const name of ["read", "ls", "find", "grep", "pdf"]) assert(names.includes(name), name);
	for (const name of ["quiz", "ask_user_question", "plan_init", "problem", "conclude", "probe_done"]) assert(!names.includes(name), name);
});

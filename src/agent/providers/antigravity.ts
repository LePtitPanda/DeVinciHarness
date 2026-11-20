import { randomUUID } from "node:crypto";
import { execFileSync, execSync, spawn } from "node:child_process";
import readline from "node:readline";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createProvider,
	createAssistantMessageEventStream,
	getCurrentSystemPrompt,
	type Api,
	type AssistantMessage,
	type JsonObject,
	type Model,
	type Provider,
	type SimpleStreamOptions,
	type ToolCall,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";

export const ANTIGRAVITY_MODELS: readonly Model<Api>[] = [
	{
		id: "gemini-3.8-flash-high",
		name: "Gemini 3.8 Flash (High)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1048576,
		maxTokens: 65536,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "gemini-3.8-flash-medium",
		name: "Gemini 3.8 Flash (Medium)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1048576,
		maxTokens: 65536,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "gemini-3.8-flash-low",
		name: "Gemini 3.8 Flash (Low)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1048576,
		maxTokens: 65536,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "gemini-4-argon-high",
		name: "Gemini 4 Argon (High)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1048576,
		maxTokens: 65536,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "gemini-4-argon-medium",
		name: "Gemini 4 Argon (Medium)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1048576,
		maxTokens: 65536,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "claude-sonnet-5-5-high",
		name: "Claude Sonnet 5.5 (High)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "claude-sonnet-5-5-medium",
		name: "Claude Sonnet 5.5 (Medium)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "claude-opus-5-5-high",
		name: "Claude Opus 5.5 (High)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
	{
		id: "gpt-oss-120b-medium",
		name: "GPT-OSS 120B (Medium)",
		api: "antigravity",
		provider: "antigravity",
		baseUrl: "",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
		thinkingLevelMap: { off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" },
	},
];

function messageContentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (typeof part === "object" && part !== null) {
					const p = part as Record<string, unknown>;
					if (typeof p.text === "string") return p.text;
					if (typeof p.thinking === "string") return `[Thinking: ${p.thinking}]`;
					if (typeof p.name === "string" && p.arguments) {
						return `<tool_call>\n${JSON.stringify({ name: p.name, arguments: p.arguments })}\n</tool_call>`;
					}
				}
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

export function parseToolCallsFromText(text: string): {
	prose: string;
	toolCalls: Array<{ name: string; arguments: JsonObject }>;
} {
	const toolCallRegex = /<tool_call>\s*(?:```(?:json)?\s*)?([\s\S]*?)(?:```\s*)?<\/tool_call>/gi;
	const toolCalls: Array<{ name: string; arguments: JsonObject }> = [];
	let lastIndex = 0;
	let prose = "";
	let match: RegExpExecArray | null;

	while ((match = toolCallRegex.exec(text)) !== null) {
		prose += text.slice(lastIndex, match.index);
		lastIndex = match.index + match[0].length;
		const jsonStr = (match[1] ?? "").trim();
		try {
			const parsed = JSON.parse(jsonStr);
			if (parsed && typeof parsed.name === "string") {
				toolCalls.push({
					name: parsed.name,
					arguments: (parsed.arguments ?? {}) as JsonObject,
				});
			}
		} catch (err) {
			console.error("Failed to parse tool call JSON:", jsonStr, err);
		}
	}
	prose += text.slice(lastIndex);

	if (toolCalls.length === 0 && text.includes("<tool_call>")) {
		const startIdx = text.indexOf("<tool_call>");
		const unclosed = text.slice(startIdx + "<tool_call>".length).trim();
		const cleaned = unclosed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
		try {
			const parsed = JSON.parse(cleaned);
			if (parsed && typeof parsed.name === "string") {
				toolCalls.push({
					name: parsed.name,
					arguments: (parsed.arguments ?? {}) as JsonObject,
				});
				prose = text.slice(0, startIdx);
			}
		} catch {
			// incomplete JSON
		}
	}

	return { prose: prose.trim(), toolCalls };
}

export function formatTranscript(context: TranscriptContext): string {
	const systemPrompt = getCurrentSystemPrompt(context.messages);
	const tools = getCurrentTools(context.messages);
	const sections: string[] = [];

	if (systemPrompt && systemPrompt.trim().length > 0) {
		sections.push(`Instructions:\n${systemPrompt.trim()}`);
	}

	if (tools && tools.length > 0) {
		const toolDocs = tools
			.map((t) => {
				const params = t.parameters ? JSON.stringify(t.parameters) : "{}";
				return `- **${t.name}**: ${t.description}\n  Parameters JSON Schema: ${params}`;
			})
			.join("\n");

		sections.push(
			`# Tools Available\n` +
			`You have access to the following tools to interact with the learning harness and learner:\n\n` +
			`${toolDocs}\n\n` +
			`## Tool Calling Instructions\n` +
			`When you need to ask a question (using probe, quiz, ask_user_question, etc.) or execute an action:\n` +
			`1. Output any introductory prose, feedback, or pedagogical reasoning first.\n` +
			`2. Call the tool using a single <tool_call> block containing a valid JSON object:\n` +
			`<tool_call>\n` +
			`{\n` +
			`  "name": "<tool_name>",\n` +
			`  "arguments": {\n` +
			`    "<parameter_name>": <value>\n` +
			`  }\n` +
			`}\n` +
			`</tool_call>\n` +
			`3. End your turn immediately after closing </tool_call> so the learner can answer in the interactive dock.`
		);
	}

	for (const msg of context.messages) {
		if (msg.role === "system") continue;
		const text = messageContentToText(msg.content);
		if (!text.trim()) continue;

		if (msg.role === "user") {
			sections.push(`User:\n${text.trim()}`);
		} else if (msg.role === "assistant") {
			sections.push(`Assistant:\n${text.trim()}`);
		} else if (msg.role === "toolResult") {
			const toolName = (msg as Record<string, unknown>).toolName ?? "tool";
			sections.push(`[Tool Result (${toolName})]:\n${text.trim()}`);
		}
	}

	return sections.join("\n\n");
}

// Fork (DeVinciHarness): agy is a full coding agent. To keep it a plain model,
// every call runs in a fresh empty folder with the terminal sandbox on, slash
// commands off, and never --dangerously-skip-permissions, so in headless mode
// anything needing approval (edits, shell) is soft-denied.
const AGY_CACHE_MS = 30_000;
let agyCache: { path: string | null; at: number } | undefined;
export function agyPath(): string | null {
	// A miss is rechecked soon: the learner may be installing agy right now.
	if (agyCache && Date.now() - agyCache.at < (agyCache.path ? AGY_CACHE_MS : 3000)) return agyCache.path;
	let found: string | null = null;
	const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe") : "";
	if (process.platform === "win32" && local && existsSync(local)) found = local;
	else {
		try {
			const out = execSync(process.platform === "win32" ? "where agy" : "command -v agy", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
			found = out.split(/\r?\n/).find((l) => l.trim()) ?? null;
		} catch { found = null; }
	}
	agyCache = { path: found, at: Date.now() };
	return found;
}

export function isAntigravityAvailable(): boolean {
	return agyPath() !== null;
}

/** Text of one stream-json step_update, deduplicated: long replies stream as
 *  ACTIVE fragments and may repeat the full text on DONE. */
export function newText(seen: Map<number, string>, update: { step_index?: number; state?: string; text_delta?: string }): string {
	const delta = update.text_delta ?? "";
	if (!delta) return "";
	const key = update.step_index ?? -1;
	const before = seen.get(key) ?? "";
	const fresh = update.state === "DONE" && before && delta.startsWith(before) ? delta.slice(before.length) : delta;
	seen.set(key, before + fresh);
	return fresh;
}

type AgyLine = {
	event?: string;
	step_update?: { step_type?: string; step_index?: number; state?: string; text_delta?: string; usage?: { input_tokens?: number; output_tokens?: number } };
	result?: { response?: string; usage?: { input_tokens?: number; output_tokens?: number } };
};

function streamAntigravity(
	requestModel: Model<Api>,
	context: TranscriptContext,
	streamOptions?: SimpleStreamOptions,
) {
	const outer = createAssistantMessageEventStream();
	const partialMessage: AssistantMessage = {
		role: "assistant",
		content: [],
		api: requestModel.api,
		provider: "antigravity",
		model: requestModel.id,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: Date.now(),
	};
	let ended = false;
	const fail = (message: string) => {
		if (ended) return;
		ended = true;
		partialMessage.stopReason = "error";
		partialMessage.errorMessage = message;
		outer.push({ type: "error", reason: "error", error: partialMessage });
		outer.end(partialMessage);
	};
	outer.push({ type: "start", partial: partialMessage });

	const bin = agyPath();
	if (!bin) { fail("Google Antigravity CLI (agy) is not installed. Install it from antigravity.google and sign in once by running agy."); return outer; }
	const modelId = requestModel.id;
	if (!/^[\w.-]+$/.test(modelId)) { fail(`Invalid Antigravity model id: ${modelId}`); return outer; }

	const args = ["--input-format", "stream-json", "--output-format", "stream-json", "--model", modelId, "--sandbox", "--disable-slash-commands"];
	const effort = streamOptions?.reasoning;
	if (effort && !/-(low|medium|high|xhigh|max)$/.test(modelId)) args.push("--effort", effort === "minimal" ? "low" : effort);

	const workDir = mkdtempSync(path.join(os.tmpdir(), "devinci-agy-"));
	const cleanup = () => { try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ } };
	const child = spawn(bin, args, {
		cwd: workDir,
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env },
		windowsHide: true,
		// .cmd shims need a shell on Windows; every arg above is a fixed flag or a validated id.
		shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(bin),
	});
	child.on("error", (err: NodeJS.ErrnoException) => { cleanup(); fail(err.code === "ENOENT" ? "Google Antigravity CLI (agy) was not found." : err.message); });
	streamOptions?.signal?.addEventListener("abort", () => child.kill(), { once: true });

	let rawOutput = "";
	let textStarted = false;
	let textEmitted = "";
	let textClosed = false;
	let emittedToolCallsCount = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	const seen = new Map<number, string>();

	const emitText = (chunk: string) => {
		if (!chunk) return;
		if (!textStarted) { textStarted = true; outer.push({ type: "text_start", contentIndex: 0, partial: partialMessage }); }
		textEmitted += chunk;
		partialMessage.content = [{ type: "text", text: textEmitted }, ...partialMessage.content.slice(1)];
		outer.push({ type: "text_delta", contentIndex: 0, delta: chunk, partial: partialMessage });
	};
	const closeText = () => {
		if (textStarted && !textClosed) { textClosed = true; outer.push({ type: "text_end", contentIndex: 0, content: textEmitted, partial: partialMessage }); }
	};
	const flushToolCalls = () => {
		const { toolCalls } = parseToolCallsFromText(rawOutput);
		for (; emittedToolCallsCount < toolCalls.length; emittedToolCallsCount++) {
			const call = toolCalls[emittedToolCallsCount];
			if (!call) continue;
			const toolCall: ToolCall = { type: "toolCall", id: `call_${randomUUID().replace(/-/g, "").slice(0, 12)}`, name: call.name, arguments: call.arguments };
			const contentIndex = partialMessage.content.length;
			partialMessage.content.push(toolCall);
			outer.push({ type: "toolcall_start", contentIndex, partial: partialMessage });
			outer.push({ type: "toolcall_end", contentIndex, toolCall, partial: partialMessage });
			partialMessage.stopReason = "toolUse";
		}
	};
	const feed = (delta: string) => {
		if (!delta) return;
		rawOutput += delta;
		const toolCallIdx = rawOutput.indexOf("<tool_call>");
		if (toolCallIdx === -1) {
			// Hold back a possibly half-written "<tool_call" tag.
			const partialTag = rawOutput.match(/<(?:\/?tool_call.*)?$/);
			emitText(rawOutput.slice(textEmitted.length, partialTag ? partialTag.index! : rawOutput.length));
		} else {
			if (!textClosed) emitText(rawOutput.slice(textEmitted.length, toolCallIdx));
			closeText();
			flushToolCalls();
		}
	};

	const rl = readline.createInterface({ input: child.stdout });
	rl.on("line", (line) => {
		let data: AgyLine;
		try { data = JSON.parse(line) as AgyLine; } catch { return; } // non-JSON log line
		if (data.event === "step_update" && data.step_update) {
			const u = data.step_update;
			// Only the model's own reply; agy's internal tool steps stay internal.
			if (!u.step_type || u.step_type === "agent_response") feed(newText(seen, u));
			if (u.usage) { inputTokens = u.usage.input_tokens ?? inputTokens; outputTokens = u.usage.output_tokens ?? outputTokens; }
		} else if (data.event === "result" && data.result) {
			if (!rawOutput && typeof data.result.response === "string") feed(data.result.response);
			if (data.result.usage) { inputTokens = data.result.usage.input_tokens ?? inputTokens; outputTokens = data.result.usage.output_tokens ?? outputTokens; }
		}
	});

	let stderrText = "";
	child.stderr.on("data", (chunk: Buffer | string) => { stderrText += chunk.toString(); });

	child.on("close", (code) => {
		cleanup();
		if (ended) return;
		// A held-back "<" that never became a tag is ordinary text.
		if (!textClosed && rawOutput.indexOf("<tool_call>") === -1) emitText(rawOutput.slice(textEmitted.length));
		closeText();
		flushToolCalls();
		partialMessage.usage = { input: inputTokens, output: outputTokens, cacheRead: 0, cacheWrite: 0, totalTokens: inputTokens + outputTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		if (code !== 0 && partialMessage.content.length === 0) {
			const msg = stderrText.trim();
			fail(/auth/i.test(msg) ? "Antigravity is not signed in. Open a terminal, run agy once and sign in with Google, then try again." : msg || `agy exited with code ${code}`);
			return;
		}
		ended = true;
		outer.push({ type: "done", reason: partialMessage.stopReason === "toolUse" ? "toolUse" : "stop", message: partialMessage });
		outer.end(partialMessage);
	});

	child.stdin.on("error", () => { /* agy exited early; the close handler reports it */ });
	child.stdin.end(`${JSON.stringify({ event: "user", message: { content: formatTranscript(context) } })}\n`, "utf-8");
	return outer;
}


/** Parse `agy models` ("slug   Display name" per line) into catalog entries. */
export function parseAgyModels(out: string): Model<Api>[] {
	const template = ANTIGRAVITY_MODELS[0]!;
	return out.split(/\r?\n/).flatMap((line) => {
		const m = /^([\w.-]+)\s{2,}(\S.*)$/.exec(line.trim());
		if (!m) return [];
		const known = ANTIGRAVITY_MODELS.find((x) => x.id === m[1]);
		return [known ?? { ...template, id: m[1]!, name: m[2]!.trim(), input: /gemini|claude/i.test(m[1]!) ? ["text", "image"] : ["text"] }];
	});
}

// The live list beats a hard-coded one (Google renames models often); one
// quick call at startup, falling back to the bundled list if agy can't answer.
let agyLive = false;
let agyTriedAt = 0;
/** True once the list came from agy itself, or a retry would be too soon. */
export function agyCatalogSettled(): boolean { return agyLive || Date.now() - agyTriedAt < 60_000; }
function liveAgyModels(): Model<Api>[] | undefined {
	agyTriedAt = Date.now();
	const bin = agyPath();
	if (!bin) return undefined;
	try {
		const out = execFileSync(bin, ["models"], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true, cwd: os.tmpdir(), shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(bin) });
		const list = parseAgyModels(out);
		agyLive = list.length > 0;
		return agyLive ? list : undefined;
	} catch { return undefined; }
}

export function antigravityProvider(): Provider<Api> {
	return createProvider({
		id: "antigravity",
		name: "Google Antigravity",
		auth: {
			apiKey: {
				name: "Antigravity Ambient",
				resolve: async () => ({
					auth: {},
					source: "local-agy",
				}),
				check: async () => ({
					source: "local-agy",
					type: "api_key",
				}),
			},
		},
		models: liveAgyModels() ?? ANTIGRAVITY_MODELS,
		api: {
			stream: streamAntigravity,
			streamSimple: streamAntigravity,
		},
	});
}

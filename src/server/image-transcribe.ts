import { normalizeContext, type ImageContent } from "@earendil-works/pi-ai";
import type { PiEngine } from "../agent/models.ts";

const PROMPT =
	"A student attached these images to their message in a study app (photos of work on paper, diagrams, screenshots). " +
	"Transcribe everything faithfully: handwriting and printed text word for word, math as LaTeX inside $...$, " +
	"and describe each diagram or figure precisely. Do not solve, correct or comment on anything.";

/** Text-only models can't see photos: the vision slot turns them into text. */
export async function transcribeImages(images: ImageContent[], engine: PiEngine, signal?: AbortSignal): Promise<string> {
	const context = normalizeContext({
		systemPrompt: PROMPT,
		messages: [{ role: "user", content: [{ type: "text", text: "Transcribe these images." }, ...images], timestamp: Date.now() }],
		tools: [],
	});
	const stream = engine.streamFn(engine.model, context, { reasoning: engine.level === "off" ? undefined : engine.level, signal } as never);
	for await (const event of stream) {
		if (event.type === "done") {
			return event.message.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("").trim();
		}
		if (event.type === "error") throw new Error(event.error.errorMessage ?? "the vision model failed");
	}
	throw new Error("the vision model returned nothing");
}

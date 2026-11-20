/* Fork (DeVinciHarness): some open models (Nemotron) narrate each step as
 * reply text ("I'll read the course first…") right before a tool call, where
 * Claude/GPT keep it in their thinking. Such text is shown inside the
 * collapsed thinking block instead. Text before a question tool still shows. */
const LEARNER_TOOLS = new Set(["tool-quiz", "tool-probe", "tool-ask_user_question", "tool-explain", "tool-recall"]);
type PartLike = { type: string; text?: string };
export function isNarration(parts: readonly PartLike[], i: number): boolean {
	if (parts[i]?.type !== "text") return false;
	for (let j = i + 1; j < parts.length; j++) {
		const t = parts[j]!.type;
		if (t === "reasoning" || (t === "text" && !parts[j]!.text?.trim())) continue;
		return t.startsWith("tool-") && !LEARNER_TOOLS.has(t);
	}
	return false;
}
/** Index of the thinking part that absorbs narration part i (same step), or -1. */
export function narrationHost(parts: readonly PartLike[], i: number): number {
	for (let j = i - 1; j >= 0 && parts[j]!.type !== "step-start"; j--) if (parts[j]!.type === "reasoning") return j;
	return -1;
}
/** The narration texts a thinking part at index i absorbs. */
export function absorbedNarration(parts: readonly PartLike[], i: number): string[] {
	const out: string[] = [];
	for (let j = i + 1; j < parts.length && parts[j]!.type !== "step-start"; j++) {
		if (isNarration(parts, j) && narrationHost(parts, j) === i) out.push(parts[j]!.text ?? "");
	}
	return out;
}

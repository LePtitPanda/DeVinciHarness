/**
 * Fork (DeVinciHarness): NVIDIA's model list is baked into the bundled Pi catalog and
 * goes stale fast (free endpoints are added and retired weekly). With a key present,
 * fetch NVIDIA's live /v1/models and use it instead: retired bundled models disappear,
 * new ones appear. Unknown ids reuse a bundled NVIDIA model's transport settings with
 * generous sizes, so they are never stuck at a tiny context.
 */
import type { Api, Model } from "@earendil-works/pi-ai";

const MODELS_URL = "https://integrate.api.nvidia.com/v1/models";
const TTL_MS = 10 * 60_000;
/** Non-chat endpoints NVIDIA lists alongside chat models. */
const NOT_CHAT = /embed|guard|safety|clip|detector|rerank|parse|retriever|reward|starcoder|calibration|cosmos|translate|kumo|pose|proteina/i;
export const NVIDIA_DEFAULT_CONTEXT = 131_072;
export const NVIDIA_DEFAULT_MAX_TOKENS = 16_384;

let live: Model<Api>[] | null = null;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

export function mergeNvidiaModels(bundled: readonly Model<Api>[], ids: readonly string[]): Model<Api>[] {
	const known = new Map(bundled.map((m) => [m.id, m]));
	const template = bundled[0];
	if (!template) return [];
	return ids.filter((id) => !NOT_CHAT.test(id)).map((id) => known.get(id) ?? ({
		...template,
		id,
		name: id.split("/").pop() ?? id,
		// Unknown capabilities: plain text, no reasoning parameters sent.
		reasoning: false,
		input: ["text"],
		contextWindow: NVIDIA_DEFAULT_CONTEXT,
		maxTokens: NVIDIA_DEFAULT_MAX_TOKENS,
	} as Model<Api>));
}

/** The live list once fetched, else the bundled one. */
export function nvidiaModels(bundled: readonly Model<Api>[]): readonly Model<Api>[] {
	return live ?? bundled;
}

export async function refreshNvidiaModels(bundled: readonly Model<Api>[], key = process.env.NVIDIA_API_KEY, fetchImpl: typeof fetch = fetch): Promise<void> {
	if (!key || Date.now() - fetchedAt < TTL_MS) return;
	inflight ??= (async () => {
		try {
			const res = await fetchImpl(MODELS_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { id?: unknown }[] };
			const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
			if (ids.length) { live = mergeNvidiaModels(bundled, ids); fetchedAt = Date.now(); }
		} catch { /* offline: keep the previous list */ } finally { inflight = null; }
	})();
	await inflight;
}

/** Test seam. */
export function resetNvidiaModels(): void { live = null; fetchedAt = 0; inflight = null; }

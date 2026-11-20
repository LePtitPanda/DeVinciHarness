import { deleteWholeGraph, graphView } from "@/src/server";

/**
 * The home graph view's data endpoint (W4; vision §1 "Home page") — thin
 * transport: the server entry (src/server/graph.ts) returns nodes, edges,
 * session provenance, and per-session understanding observations.
 */

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(graphView());
}

/** DELETE /api/graph — wipe the whole map (Settings → Graph). */
export async function DELETE() {
	const outcome = deleteWholeGraph();
	if (!outcome.ok) return Response.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
	return Response.json({ graphRevision: outcome.graphRevision });
}

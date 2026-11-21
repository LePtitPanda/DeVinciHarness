// Fork (DeVinciHarness): a short "how this session goes" card pinned at the top of the transcript.
const STEPS = {
	teaching: [
		"A few quick questions to see what you already know.",
		"A plan of the steps, shown as a map.",
		"One step at a time, each ending with a quick “Got it?” question.",
	],
	practice: [
		"It tells you what you will practise.",
		"Exercises one by one. Write your reasoning, or attach a photo of your paper.",
		"Feedback after each answer. Ask for a hint whenever you are stuck.",
	],
} as const;

export function SessionIntro({ kind }: { kind: "teaching" | "practice" }) {
	return (
		<section data-testid="session-intro" className="rounded-lg border border-border/60 px-4 py-3 text-sm text-muted-foreground">
			<p className="mb-1.5 text-xs font-medium uppercase tracking-wide">How it goes</p>
			<ol className="list-decimal space-y-0.5 pl-5">
				{STEPS[kind].map((s) => <li key={s}>{s}</li>)}
			</ol>
		</section>
	);
}

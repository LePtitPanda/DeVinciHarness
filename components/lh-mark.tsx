/**
 * Fork (DeVinciHarness): the app mark is the De Vinci "V" (vector from the
 * school's own design API, api.devinci.me/design/logo/devinci/v). Drawn in the
 * strong line ink so it follows light/dark themes. Cropped viewBox, no padding.
 */
export function LhMark({ className = "" }: { className?: string }) {
	return (
		<svg viewBox="60 55 180 192" className={className} aria-hidden="true">
			<path d="M235,85.7l-34.4,67c0,0-32.8-51.1-16.2-80.5c14.1-21.9,34.7-11.8,37.6-9.4C230.1,67.6,235,76.3,235,85.7z" style={{ fill: "var(--lh-line-strong)" }} />
			<path d="M159.9,178.9L103,68.6H65l89.4,173.1l0,0C166.7,232.8,172.1,202.5,159.9,178.9z" style={{ fill: "var(--lh-line-strong)" }} />
		</svg>
	);
}

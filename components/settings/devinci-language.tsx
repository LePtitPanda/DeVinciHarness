"use client";
/**
 * Fork (DeVinciHarness): interface and AI language, shown in Appearance.
 * The values live in the De Vinci plugin (its translator applies them), so
 * the rows read and write through that plugin's operations.
 */
import { useEffect, useState } from "react";
import { SettingsRow, ThinSelect } from "./controls.tsx";

type Langs = { language: string; aiLanguage: string };
const call = async (operation: string, input?: unknown) => {
	const res = await fetch("/api/plugins/devinci/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, input }) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return ((await res.json()) as { result: unknown }).result;
};

export function DevinciLanguageRows() {
	const [langs, setLangs] = useState<Langs | null>(null);
	useEffect(() => { call("status").then((s) => setLangs(s as Langs)).catch(() => setLangs(null)); }, []);
	if (!langs) return null; // plugin off or unreachable: nothing to set
	return (
		<>
			<SettingsRow label="Language" hint="The whole app. Changing it reloads the window." testid="row-language">
				<ThinSelect ariaLabel="Language" value={langs.language} onChange={async (v) => {
					await call("set-profile", { language: v });
					try { localStorage.setItem("dv.lang", v); } catch { /* per-window convenience only */ }
					location.reload();
				}}>
					<option value="en">English</option>
					<option value="fr">Français</option>
				</ThinSelect>
			</SettingsRow>
			<SettingsRow label="AI language" testid="row-ai-language">
				<ThinSelect ariaLabel="AI language" value={langs.aiLanguage} onChange={async (v) => {
					await call("set-profile", { aiLanguage: v });
					setLangs({ ...langs, aiLanguage: v });
				}}>
					<option value="auto">Same as language</option>
					<option value="en">English</option>
					<option value="fr">Français</option>
				</ThinSelect>
			</SettingsRow>
		</>
	);
}

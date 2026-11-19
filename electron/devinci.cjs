"use strict";
// Fork (DeVinciHarness): Moodle sign-in for the "devinci" plugin.
// The learner signs in to the school's own login page in an app window; Moodle's
// mobile-app launch flow then hands back a web-service token (read-only use is
// enforced by the plugin's allowlist). The password never reaches this code.
// The token is stored encrypted with the OS keychain (safeStorage) and given to
// the server child only over its private IPC channel.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const electron = () => require("electron"); // lazy, so parseLaunchUrl is testable in plain Node

const SITE = "https://learning.devinci.fr";
const SCHEME = "moodlemobile://";
const PARTITION = "persist:devinci";
const CHANNEL = "lh:devinci";

/** Moodle signs the launch result with md5(wwwroot + passport); reject anything else. */
function parseLaunchUrl(url, passport, site = SITE) {
	const encoded = url.slice(SCHEME.length).replace(/^token=/, "").replace(/\/$/, "");
	const [signature, token] = Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8").split(":::");
	if (signature !== crypto.createHash("md5").update(site + passport).digest("hex")) throw new Error("Moodle sign-in could not be verified.");
	if (!/^[0-9a-f]{32}$/i.test(token ?? "")) throw new Error("Moodle returned no usable token.");
	return token;
}

function openLogin() {
	return new Promise((resolve, reject) => {
		const passport = String(crypto.randomInt(1, 2 ** 31));
		const { BrowserWindow } = electron();
		const win = new BrowserWindow({
			width: 520, height: 740, title: "Sign in to De Vinci Learning", autoHideMenuBar: true,
			parent: BrowserWindow.getFocusedWindow() ?? undefined,
			webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
		});
		let settled = false;
		const finish = (error, token) => {
			if (settled) return;
			settled = true;
			if (!win.isDestroyed()) win.close();
			if (error) reject(error); else resolve(token);
		};
		const check = (event, url) => {
			if (typeof url !== "string" || !url.startsWith(SCHEME)) return;
			event?.preventDefault?.();
			try { finish(null, parseLaunchUrl(url, passport)); } catch (error) { finish(error); }
		};
		const contents = win.webContents;
		contents.on("will-navigate", (e, url) => check(e, url ?? e?.url));
		contents.on("will-redirect", (e, url) => check(e, url ?? e?.url));
		contents.on("did-start-navigation", (e, url) => check(e, url ?? e?.url));
		contents.on("did-fail-load", (_e, _code, _desc, url) => check(null, url));
		contents.setWindowOpenHandler(({ url }) => { check(null, url); return { action: "deny" }; });
		win.on("closed", () => finish(new Error("Sign-in window was closed.")));
		win.loadURL(`${SITE}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`).catch(() => { /* scheme redirect aborts the load; handled above */ });
	});
}

function createDevinci(userData) {
	const file = path.join(userData, "devinci-moodle.json");
	const read = () => {
		try {
			const { token } = JSON.parse(fs.readFileSync(file, "utf8"));
			return electron().safeStorage.decryptString(Buffer.from(token, "base64"));
		} catch { return null; }
	};
	const write = (token) => {
		const { safeStorage } = electron();
		if (!safeStorage.isEncryptionAvailable()) throw new Error("OS encryption is unavailable; the token was not saved.");
		fs.writeFileSync(file, JSON.stringify({ token: safeStorage.encryptString(token).toString("base64") }), { mode: 0o600 });
	};
	let pendingLogin = null;
	const ops = {
		token: async () => ({ token: read() }),
		login: async () => {
			pendingLogin ??= openLogin().finally(() => { pendingLogin = null; });
			const token = await pendingLogin;
			write(token);
			return { token };
		},
		logout: async () => {
			fs.rmSync(file, { force: true });
			await electron().session.fromPartition(PARTITION).clearStorageData();
			return { token: null };
		},
	};
	return {
		attach(child) {
			const listener = async (message) => {
				if (message?.channel !== CHANNEL || typeof message.id !== "string" || !Object.hasOwn(ops, message.op)) return;
				const reply = (packet) => { if (child.connected) { try { child.send({ channel: CHANNEL, id: message.id, ...packet }, () => {}); } catch { /* child exited */ } } };
				try { reply({ ok: true, value: await ops[message.op]() }); }
				catch (error) { reply({ ok: false, error: error?.message ?? "Sign-in failed." }); }
			};
			child.on("message", listener);
			return () => child.removeListener("message", listener);
		},
	};
}

module.exports = { createDevinci, parseLaunchUrl };

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

const LEO_SITE = "https://leolearning.fr";
const LEO_API = `${LEO_SITE}/api/leodata`;
const LEO_ROOT = `${LEO_API}/directory/root/content`;
const leoFetch = (url) => electron().session.fromPartition(PARTITION).fetch(url, { credentials: "include" });

/** The learner signs in on LeoData's own page; the window closes once its API answers. */
function leoLogin() {
	return new Promise((resolve) => {
		const { BrowserWindow } = electron();
		const win = new BrowserWindow({
			width: 980, height: 760, title: "Sign in to LeoData", autoHideMenuBar: true,
			parent: BrowserWindow.getFocusedWindow() ?? undefined,
			webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
		});
		let done = false;
		const finish = (ok) => {
			if (done) return;
			done = true;
			clearInterval(timer);
			if (!win.isDestroyed()) win.close();
			resolve(ok);
		};
		const timer = setInterval(() => { leoFetch(LEO_ROOT).then((r) => r.ok && finish(true), () => {}); }, 2000);
		win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		win.on("closed", () => finish(false));
		win.loadURL(`${LEO_SITE}/`).catch(() => {});
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
		// LeoData (leolearning.fr): same school login, cookie session kept in the
		// partition. Only GETs of folder listings and file contents are possible.
		"leo-status": async () => ({ connected: (await leoFetch(LEO_ROOT)).ok }),
		"leo-login": async () => {
			pendingLeo ??= leoLogin().finally(() => { pendingLeo = null; });
			return { connected: await pendingLeo };
		},
		"leo-get": async (args) => {
			const id = String(args?.id ?? "");
			if (!/^(root|[A-Za-z0-9]{1,64})$/.test(id) || !["dir", "file"].includes(args?.kind)) throw new Error("Invalid LeoData request.");
			const res = await leoFetch(args.kind === "dir" ? `${LEO_API}/directory/${id}/content` : `${LEO_API}/file/${id}/content`);
			if (res.status === 401) throw new Error("Not signed in to LeoData. Press Connect for LeoData on the De Vinci page.");
			if (!res.ok) throw new Error(`LeoData answered HTTP ${res.status}`);
			if (args.kind === "dir") return (await res.json()).directory;
			const bytes = Buffer.from(await res.arrayBuffer());
			if (bytes.length > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB.");
			return { base64: bytes.toString("base64") };
		},
	};
	let pendingLeo = null;
	return {
		attach(child) {
			const listener = async (message) => {
				if (message?.channel !== CHANNEL || typeof message.id !== "string" || !Object.hasOwn(ops, message.op)) return;
				const reply = (packet) => { if (child.connected) { try { child.send({ channel: CHANNEL, id: message.id, ...packet }, () => {}); } catch { /* child exited */ } } };
				try { reply({ ok: true, value: await ops[message.op](message.args) }); }
				catch (error) { reply({ ok: false, error: error?.message ?? "Sign-in failed." }); }
			};
			child.on("message", listener);
			return () => child.removeListener("message", listener);
		},
	};
}

module.exports = { createDevinci, parseLaunchUrl };

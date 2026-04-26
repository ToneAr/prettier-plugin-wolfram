// src/bridge/index.js
//
// Connects to the shared kernel-server.js helper process via a local socket.
// The first process that can't connect spawns kernel-server.js under the
// system Node.js binary (not Electron), so native WSTP loading and the
// wolframscript fallback both run outside the VS Code/Electron host.
// All subsequent processes (other VS Code windows, CLI runs, etc.) connect to
// the same socket and share the single running WL kernel.

import { spawn, execSync } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const IS_WIN = process.platform === "win32";
const KERNEL_SOCKET_BASENAME = "prettier-wl-kernel-v6";
const DEFAULT_CST_REQUEST_TIMEOUT_MS = 180000;
const MIN_CST_REQUEST_TIMEOUT_MS = 1000;
const CLIENT_TIMEOUT_GRACE_MS = 5000;

const SOCKET_PATH =
	process.env.WL_KERNEL_SOCKET ??
	(IS_WIN
		? `\\\\.\\pipe\\${KERNEL_SOCKET_BASENAME}`
		: path.join(os.tmpdir(), `${KERNEL_SOCKET_BASENAME}.sock`));

const LOCK_PATH =
	process.env.WL_KERNEL_LOCK ??
	path.join(os.tmpdir(), `${KERNEL_SOCKET_BASENAME}.lock`);

const SERVER_SCRIPT = path.join(__dirname, "../../scripts/kernel-server.js");

// ─── socket client state ─────────────────────────────────────────────────────

let _sock = null;
let _sockBuf = "";
let _pending = new Map(); // id → { resolve, reject, timer }
let _nextId = 0;
let _initPromise = null;

function normalizeCSTRequestTimeoutMs(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return DEFAULT_CST_REQUEST_TIMEOUT_MS;
	}
	return Math.max(MIN_CST_REQUEST_TIMEOUT_MS, Math.floor(numeric));
}

function formatTimeout(timeoutMs) {
	const seconds = timeoutMs / 1000;
	return Number.isInteger(seconds) ? `${seconds}s` : `${timeoutMs}ms`;
}

// ─── connection helpers ───────────────────────────────────────────────────────

function connectOnce(sockPath, timeoutMs = 1500) {
	return new Promise((resolve) => {
		const s = net.createConnection(sockPath);
		const done = (result) => {
			clearTimeout(t);
			s.removeAllListeners();
			if (!result && !s.destroyed) s.destroy();
			resolve(result);
		};
		const t = setTimeout(() => done(null), timeoutMs);
		s.once("connect", () => done(s));
		s.once("error", () => done(null));
	});
}

function attachConn(sock) {
	_sock = sock;

	sock.on("data", (chunk) => {
		_sockBuf += chunk.toString();
		let nl;
		while ((nl = _sockBuf.indexOf("\n")) !== -1) {
			const line = _sockBuf.slice(0, nl).trim();
			_sockBuf = _sockBuf.slice(nl + 1);
			if (!line) continue;
			let msg;
			try {
				msg = JSON.parse(line);
			} catch {
				continue;
			}
			const p = _pending.get(msg.id);
			if (!p) continue;
			clearTimeout(p.timer);
			_pending.delete(msg.id);
			if (msg.error) p.reject(new Error(msg.error));
			else p.resolve(msg.result);
		}
	});

	const drop = (reason) => {
		_sock = null;
		_sockBuf = "";
		for (const { reject, timer } of _pending.values()) {
			clearTimeout(timer);
			reject(new Error(reason));
		}
		_pending.clear();
	};

	sock.on("error", () =>
		drop("Kernel socket error — will reconnect on next request"),
	);
	sock.on("close", () => {
		if (_sock === sock)
			drop("Kernel socket closed — will reconnect on next request");
	});
}

// ─── lock helpers (Unix) ─────────────────────────────────────────────────────

function lockPidAlive() {
	try {
		const pid = parseInt(fs.readFileSync(LOCK_PATH, "utf8"), 10);
		if (isNaN(pid)) return false;
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function grabLock() {
	try {
		fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
		return true;
	} catch {
		return false;
	}
}

function releaseLock() {
	try {
		fs.unlinkSync(LOCK_PATH);
	} catch {}
}

// ─── find system Node.js (not Electron) ──────────────────────────────────────

function findNodeBin() {
	if (process.env.WOLFRAM_NODE_PATH) return process.env.WOLFRAM_NODE_PATH;
	// In Electron, process.execPath is the Electron binary — find real node instead.
	if (!process.versions?.electron) return process.execPath;
	try {
		const cmd = IS_WIN ? "where node" : "which node";
		return execSync(cmd, { encoding: "utf8", timeout: 2000 })
			.trim()
			.split(/\r?\n/)[0]
			.trim();
	} catch {
		throw new Error(
			"Node.js not found in PATH. " +
				"Set WOLFRAM_NODE_PATH to the node executable path.",
		);
	}
}

// ─── spawn the kernel-server helper ──────────────────────────────────────────

function spawnServer(enginePath) {
	const nodeBin = findNodeBin();
	const env = {
		...process.env,
		WOLFRAM_ENGINE_PATH:
			enginePath || process.env.WOLFRAM_ENGINE_PATH || "",
		WL_KERNEL_SOCKET: SOCKET_PATH,
		WL_KERNEL_LOCK: LOCK_PATH,
	};

	return new Promise((resolve, reject) => {
		const proc = spawn(nodeBin, [SERVER_SCRIPT], {
			stdio: ["ignore", "pipe", "ignore"],
			env,
			detached: true,
		});

		let settled = false;
		let buf = "";

		const done = (val) => {
			if (settled) return;
			settled = true;
			clearTimeout(startupTimer);
			proc.stdout.destroy();
			proc.unref();
			resolve(val);
		};

		proc.stdout.on("data", (chunk) => {
			buf += chunk.toString();
			if (buf.includes("KERNEL_READY")) done("started");
			else if (buf.includes("KERNEL_TAKEN")) done("taken");
		});

		proc.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(startupTimer);
			releaseLock();
			reject(err);
		});

		proc.on("exit", (code) => {
			// Graceful exit means EADDRINUSE (kernel already running).
			if (!settled) done("exited");
		});

		// WL kernel cold-start with CodeParser can take up to 90 s.
		const startupTimer = setTimeout(() => {
			if (!settled) {
				settled = true;
				proc.unref();
				releaseLock();
				reject(new Error("Kernel server startup timed out after 90s"));
			}
		}, 90000);
	});
}

// ─── init: connect or spawn ───────────────────────────────────────────────────

async function init(enginePath) {
	if (_sock) return;
	if (_initPromise) {
		await _initPromise;
		return;
	}

	_initPromise = _doInit(enginePath).finally(() => {
		_initPromise = null;
	});
	await _initPromise;
}

async function _doInit(enginePath) {
	// Fast path: an existing server is already listening.
	let sock = await connectOnce(SOCKET_PATH);
	if (sock) {
		attachConn(sock);
		return;
	}

	if (!IS_WIN) {
		// A live server process holds the lock but the socket isn't reachable yet
		// (racing startup). Give it a moment then retry.
		if (lockPidAlive()) {
			await new Promise((r) => setTimeout(r, 2500));
			sock = await connectOnce(SOCKET_PATH, 3000);
			if (sock) {
				attachConn(sock);
				return;
			}
		}

		// Either no lock, or the lock is stale. Grab it.
		if (!lockPidAlive()) releaseLock();
		if (!grabLock()) {
			// Lost the election — wait for the winner to start.
			await new Promise((r) => setTimeout(r, 4000));
			sock = await connectOnce(SOCKET_PATH, 4000);
			if (sock) {
				attachConn(sock);
				return;
			}
			throw new Error("Kernel server did not become reachable in time.");
		}
	}

	// We either grabbed the lock (Unix) or are on Windows — try to spawn.
	await spawnServer(enginePath);

	// Whether the server just started or EADDRINUSE, we should be able to connect.
	sock = await connectOnce(SOCKET_PATH, 10000);
	if (sock) {
		attachConn(sock);
		return;
	}

	if (!IS_WIN) releaseLock();
	throw new Error("Kernel socket not reachable after server start.");
}

// ─── public API ──────────────────────────────────────────────────────────────

export class KernelBridge {
	#options;

	constructor(options = {}) {
		this.#options = options;
	}

	async getCST(sourceText, prettierOptions = {}) {
		const enginePath =
			prettierOptions.wolframEnginePath ??
			this.#options.wolframEnginePath ??
			"";
		const tabWidth =
			prettierOptions.tabWidth ?? this.#options.tabWidth ?? 2;
		const timeoutMs = normalizeCSTRequestTimeoutMs(
			prettierOptions.wolframCSTRequestTimeoutMs ??
				this.#options.wolframCSTRequestTimeoutMs,
		);

		await init(enginePath);

		const id = ++_nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				_pending.delete(id);
				reject(
					new Error(
						`Kernel CST request timed out after ${formatTimeout(timeoutMs)}`,
					),
				);
			}, timeoutMs + CLIENT_TIMEOUT_GRACE_MS);
			_pending.set(id, { resolve, reject, timer });
			_sock.write(
				JSON.stringify({
					id,
					source: sourceText,
					tabWidth,
					timeoutMs,
				}) + "\n",
			);
		});
	}

	close() {
		if (_sock) {
			_sock.destroy();
			_sock = null;
		}
	}
}

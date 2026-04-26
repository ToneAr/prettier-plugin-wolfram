#!/usr/bin/env node
/**
 * scripts/kernel-server.js
 *
 * Long-lived helper process spawned by src/bridge/index.js.
 * Runs in plain Node.js (not Electron) so native WSTP loading and the
 * wolframscript fallback stay outside the VS Code/Electron host.
 * Owns a single WstpClient and serves CST requests to all connecting
 * processes over a Unix domain socket (Linux/macOS) or named pipe (Windows).
 *
 * Signals written to stdout (one line each):
 *   KERNEL_READY   – socket is bound and ready to accept requests
 *   KERNEL_TAKEN   – socket already bound by another server; this process exits
 *
 * Env vars read:
 *   WOLFRAM_ENGINE_PATH   – passed to WstpClient for kernel auto-detection
 *   WL_KERNEL_SOCKET      – override default socket path (testing)
 *   WL_KERNEL_LOCK        – override default lock path (testing)
 */

import { WstpClient } from "../src/bridge/wstpClient.js";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";

const IS_WIN = process.platform === "win32";
const KERNEL_SOCKET_BASENAME = "prettier-wl-kernel-v6";

const SOCKET_PATH =
	process.env.WL_KERNEL_SOCKET ??
	(IS_WIN
		? `\\\\.\\pipe\\${KERNEL_SOCKET_BASENAME}`
		: path.join(os.tmpdir(), `${KERNEL_SOCKET_BASENAME}.sock`));

const LOCK_PATH =
	process.env.WL_KERNEL_LOCK ??
	path.join(os.tmpdir(), `${KERNEL_SOCKET_BASENAME}.lock`);

// ─── socket server ────────────────────────────────────────────────────────────

const wstp = new WstpClient(process.env.WOLFRAM_ENGINE_PATH || "");
const server = net.createServer(handleClient);

if (!IS_WIN) {
	try {
		fs.unlinkSync(SOCKET_PATH);
	} catch {}
}

server.once("error", (err) => {
	if (err.code === "EADDRINUSE") {
		// Another server won the race — this instance is redundant.
		process.stdout.write("KERNEL_TAKEN\n");
		process.stdout.end();
		wstp.close();
		process.exit(0);
	}
	process.stderr.write(`kernel-server: ${err.message}\n`);
	process.exit(1);
});

server.listen(SOCKET_PATH, () => {
	// Write our PID into the lock file so clients can check liveness.
	try {
		fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "w" });
	} catch {}

	process.stdout.write("KERNEL_READY\n");
	// Close stdout so Electron's pipe handle is released.
	process.stdout.end();
});

function handleClient(conn) {
	let buf = "";
	conn.on("data", (chunk) => {
		buf += chunk.toString();
		let nl;
		while ((nl = buf.indexOf("\n")) !== -1) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (line) serveRequest(conn, line);
		}
	});
	conn.on("error", () => {});
}

async function serveRequest(conn, line) {
	let req;
	try {
		req = JSON.parse(line);
	} catch {
		return;
	}
	try {
		const result = await wstp.getCST(req.source, req.tabWidth ?? 2, {
			timeoutMs: req.timeoutMs,
		});
		conn.write(JSON.stringify({ id: req.id, result }) + "\n");
	} catch (err) {
		conn.write(JSON.stringify({ id: req.id, error: err.message }) + "\n");
	}
}

// ─── cleanup ──────────────────────────────────────────────────────────────────

function cleanup() {
	server.close();
	wstp.close();
	if (!IS_WIN) {
		try {
			fs.unlinkSync(SOCKET_PATH);
		} catch {}
	}
	try {
		fs.unlinkSync(LOCK_PATH);
	} catch {}
	process.exit(0);
}

process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);
process.once("exit", () => {
	if (!IS_WIN) {
		try {
			fs.unlinkSync(SOCKET_PATH);
		} catch {}
	}
	try {
		fs.unlinkSync(LOCK_PATH);
	} catch {}
});

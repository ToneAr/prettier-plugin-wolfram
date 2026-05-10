#!/usr/bin/env node
/**
 * scripts/debug-bridge.js
 *
 * Manual debugger for KernelBridge. Exercises the installed-package runtime:
 *   1. Probe the shared helper socket or named pipe
 *   2. Ask KernelBridge for a CST, auto-starting the helper when needed
 *   3. Parse a second snippet to confirm connection reuse
 *   4. Close the client connection so the helper can idle-exit
 *
 * Run with:
 *   node scripts/debug-bridge.js
 *   VERBOSE=1 node scripts/debug-bridge.js
 */

import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import net from "net";
import os from "os";
import path from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const IS_WIN = process.platform === "win32";
const KERNEL_SOCKET_BASENAME = "prettier-wl-kernel-v8";
const SOCKET_PATH =
	process.env.WL_KERNEL_SOCKET ??
	(IS_WIN
		? `\\\\.\\pipe\\${KERNEL_SOCKET_BASENAME}`
		: path.join(os.tmpdir(), `${KERNEL_SOCKET_BASENAME}.sock`));

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function tag(color, label) {
	return `${BOLD}${color}[${label}]${RESET}`;
}

const info = (...values) => console.error(tag(CYAN, "info"), ...values);
const ok = (...values) => console.error(tag(GREEN, " ok "), ...values);
const warn = (...values) => console.error(tag(YELLOW, "warn"), ...values);
const fail = (...values) => console.error(tag(RED, "FAIL"), ...values);
const step = (number, description) =>
	console.error(`\n${BOLD}-- Step ${number}: ${description}${RESET}`);

function elapsed(start) {
	return `${DIM}(${Date.now() - start} ms)${RESET}`;
}

function probeSocket(socketPath, timeoutMs = 2000) {
	return new Promise((resolve) => {
		const socket = net.createConnection(socketPath);
		const finish = (result) => {
			clearTimeout(timer);
			socket.removeAllListeners();
			if (!result && !socket.destroyed) socket.destroy();
			resolve(result);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
	});
}

async function main() {
	console.error(`\n${BOLD}KernelBridge Debug Session${RESET}`);
	console.error(`Shared socket : ${SOCKET_PATH}`);
	console.error(`VERBOSE       : ${process.env.VERBOSE ?? "0"}`);
	console.error(`Helper script : ${join(__dirname, "kernel-server.js")}`);

	step(1, "Probe shared helper socket");
	let start = Date.now();
	const socketOpen = await probeSocket(SOCKET_PATH);
	if (socketOpen) {
		ok(`Shared helper is already reachable ${elapsed(start)}`);
	} else {
		warn(
			`No helper is reachable yet; KernelBridge will auto-start one ${elapsed(start)}`,
		);
	}

	step(2, "Import KernelBridge and request CST for 'f[x_] := x + 1'");
	info("Importing src/bridge/index.js");
	let KernelBridge;
	try {
		({ KernelBridge } = await import(
			pathToFileURL(join(__dirname, "../src/bridge/index.js")).href
		));
		ok("Module imported");
	} catch (error) {
		fail("Import failed:", error.message);
		process.exit(1);
	}

	const bridge = new KernelBridge();
	const snippet1 = "f[x_] := x + 1";
	info(`Calling bridge.getCST(${JSON.stringify(snippet1)})`);
	start = Date.now();
	let cst1;
	try {
		cst1 = await bridge.getCST(snippet1, {});
		ok(`CST received ${elapsed(start)}`);
	} catch (error) {
		fail(`getCST threw: ${error.message}`);
		bridge.close();
		process.exit(1);
	}

	step(3, "Inspect CST structure");
	info("Top-level node:");
	console.error(
		JSON.stringify({ type: cst1.type, kind: cst1.kind }, null, 2),
	);
	const childCount = cst1.children?.length ?? 0;
	info(`Children at top level: ${childCount}`);
	if (childCount > 0) {
		info("First child:");
		console.error(JSON.stringify(cst1.children[0], null, 2));
	}
	if (cst1.locStart !== undefined) {
		info(`locStart=${cst1.locStart}  locEnd=${cst1.locEnd}`);
		ok("Offset table attached; offsets look good");
	} else {
		warn("locStart/locEnd missing; offsets may not have been applied");
	}

	step(4, "Second CST request should reuse the connection");
	const snippet2 = "1 + 2 * 3";
	info(`Calling bridge.getCST(${JSON.stringify(snippet2)})`);
	start = Date.now();
	try {
		const cst2 = await bridge.getCST(snippet2, {});
		ok(`CST received ${elapsed(start)}`);
		info(`Top-level: type=${cst2.type} kind=${cst2.kind}`);
	} catch (error) {
		fail(`Second getCST threw: ${error.message}`);
	}

	step(5, "Close client socket");
	bridge.close();
	ok(
		"bridge.close() called; shared helper will exit unless another client connects",
	);

	console.error(`\n${BOLD}${GREEN}Debug session complete.${RESET}\n`);
}

main().catch((error) => {
	fail("Unhandled error:", error.message);
	process.exit(1);
});

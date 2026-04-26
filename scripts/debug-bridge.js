#!/usr/bin/env node
/**
 * scripts/debug-bridge.js
 *
 * Manual debugger for KernelBridge.  Exercises the full lifecycle:
 *   1. Probe an already-running LSP bridge (or report that none exists)
 *   2. Auto-start the managed bridge if none is found
 *   3. Parse a trivial WL snippet and print the raw CST
 *   4. Parse a second snippet to confirm connection reuse
 *   5. Close cleanly
 *
 * Run with:
 *   node scripts/debug-bridge.js
 *   node scripts/debug-bridge.js --port 6123
 *   VERBOSE=1 node scripts/debug-bridge.js
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import net from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── helpers ────────────────────────────────────────────────────────────────

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

const info = (...a) => console.error(tag(CYAN, "info"), ...a);
const ok = (...a) => console.error(tag(GREEN, " ok "), ...a);
const warn = (...a) => console.error(tag(YELLOW, "warn"), ...a);
const fail = (...a) => console.error(tag(RED, "FAIL"), ...a);
const step = (n, desc) =>
	console.error(`\n${BOLD}── Step ${n}: ${desc}${RESET}`);

function elapsed(start) {
	return `${DIM}(${Date.now() - start} ms)${RESET}`;
}

// ─── args ────────────────────────────────────────────────────────────────────

const portArg = process.argv.indexOf("--port");
const preferredPort =
	portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 6123;

// ─── quick TCP probe (does not import KernelBridge so it's dependency-free) ──

function probePort(host, port, timeoutMs = 2000) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve(false);
		}, timeoutMs);
		socket.once("connect", () => {
			clearTimeout(timer);
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
	console.error(`\n${BOLD}KernelBridge Debug Session${RESET}`);
	console.error(`Preferred port : ${preferredPort}`);
	console.error(`VERBOSE        : ${process.env.VERBOSE ?? "0"}`);
	console.error(`Bridge script  : ${join(__dirname, "kernel-server.js")}`);

	// ── Step 1: raw TCP probe ──────────────────────────────────────────────
	step(1, "Raw TCP probe (is anything listening on the port?)");
	let t = Date.now();
	const portOpen = await probePort("127.0.0.1", preferredPort);
	if (portOpen) {
		ok(`Port ${preferredPort} is OPEN — a process is already listening ${elapsed(t)}`);
	} else {
		warn(
			`Port ${preferredPort} is CLOSED — KernelBridge will auto-start the bridge ${elapsed(t)}`,
		);
	}

	// ── Step 2: import KernelBridge and call getCST (first call) ──────────
	step(2, "Import KernelBridge and request CST for 'f[x_] := x + 1'");
	info("Importing src/bridge/index.js …");
	let KernelBridge;
	try {
		({ KernelBridge } = await import(
			join(__dirname, "../src/bridge/index.js")
		));
		ok("Module imported");
	} catch (err) {
		fail("Import failed:", err.message);
		process.exit(1);
	}

	const bridge = new KernelBridge({ wolframLSPPort: preferredPort });
	info("KernelBridge instance created");

	const snippet1 = "f[x_] := x + 1";
	info(`Calling bridge.getCST(${JSON.stringify(snippet1)}) …`);
	t = Date.now();
	let cst1;
	try {
		cst1 = await bridge.getCST(snippet1, {});
		ok(`CST received ${elapsed(t)}`);
	} catch (err) {
		fail(`getCST threw: ${err.message}`);
		bridge.close();
		process.exit(1);
	}

	// ── Step 3: inspect the CST ───────────────────────────────────────────
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
		ok("Offset table attached — offsets look good");
	} else {
		warn("locStart/locEnd missing — offsets may not have been applied");
	}

	// ── Step 4: second call (connection reuse) ────────────────────────────
	step(4, "Second CST request — connection should be reused");
	const snippet2 = "1 + 2 * 3";
	info(`Calling bridge.getCST(${JSON.stringify(snippet2)}) …`);
	t = Date.now();
	let cst2;
	try {
		cst2 = await bridge.getCST(snippet2, {});
		ok(`CST received ${elapsed(t)}`);
		info(`Top-level: type=${cst2.type} kind=${cst2.kind}`);
	} catch (err) {
		fail(`Second getCST threw: ${err.message}`);
	}

	// ── Step 5: close ─────────────────────────────────────────────────────
	step(5, "Close bridge");
	bridge.close();
	ok("bridge.close() called — managed bridge process (if any) will be terminated");

	console.error(`\n${BOLD}${GREEN}Debug session complete.${RESET}\n`);
}

main().catch((err) => {
	fail("Unhandled error:", err.message);
	process.exit(1);
});

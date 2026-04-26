import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

const fakeCst = {
	type: "ContainerNode",
	kind: "File",
	children: [],
	source: [[1, 1], [1, 1]],
};

let tempDir = "";
let connectionPlan = [];
let writtenRequests = [];

const createConnection = vi.fn(() => {
	const socket = new EventEmitter();
	const plan = connectionPlan.shift() ?? "connect";

	socket.destroyed = false;
	socket.destroy = vi.fn(() => {
		socket.destroyed = true;
		setImmediate(() => socket.emit("close"));
	});
	socket.write = vi.fn((payload) => {
		const request = JSON.parse(payload.trim());
		writtenRequests.push(request);
		setImmediate(() => {
			if (socket.destroyed) return;
			socket.emit(
				"data",
				Buffer.from(JSON.stringify({ id: request.id, result: fakeCst }) + "\n"),
			);
		});
	});

	if (plan === "error") {
		setImmediate(() => socket.emit("error", new Error("ECONNREFUSED")));
	} else {
		setImmediate(() => socket.emit("connect"));
	}

	return socket;
});

const spawn = vi.fn(() => {
	const proc = new EventEmitter();
	proc.stdout = new EventEmitter();
	proc.stdout.destroy = vi.fn();
	proc.unref = vi.fn();

	setImmediate(() => proc.stdout.emit("data", Buffer.from("KERNEL_READY\n")));
	return proc;
});

const execSync = vi.fn(() => `${process.execPath}\n`);

vi.mock("net", () => ({
	default: { createConnection },
	createConnection,
}));

vi.mock("child_process", () => ({
	default: { spawn, execSync },
	spawn,
	execSync,
}));

async function loadBridge() {
	vi.resetModules();
	return import("../../src/bridge/index.js");
}

describe("KernelBridge", () => {
	beforeEach(() => {
		tempDir = mkdtempSync(path.join(os.tmpdir(), "prettier-wl-bridge-"));
		process.env.WL_KERNEL_SOCKET = path.join(tempDir, "kernel.sock");
		process.env.WL_KERNEL_LOCK = path.join(tempDir, "kernel.lock");
		connectionPlan = [];
		writtenRequests = [];
		createConnection.mockClear();
		spawn.mockClear();
		execSync.mockClear();
	});

	afterEach(() => {
		delete process.env.WL_KERNEL_SOCKET;
		delete process.env.WL_KERNEL_LOCK;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("spawns the helper when no socket is listening", async () => {
		connectionPlan = ["error", "connect"];
		const { KernelBridge } = await loadBridge();
		const bridge = new KernelBridge();

		const cst = await bridge.getCST("f[x]", { tabWidth: 4 });

		expect(cst).toMatchObject(fakeCst);
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(writtenRequests).toEqual([
			expect.objectContaining({
				source: "f[x]",
				tabWidth: 4,
				timeoutMs: 180000,
			}),
		]);

		bridge.close();
	});

	it("passes a configured CST request timeout to the helper", async () => {
		connectionPlan = ["connect"];
		const { KernelBridge } = await loadBridge();
		const bridge = new KernelBridge();

		await bridge.getCST("f[x]", {
			tabWidth: 4,
			wolframCSTRequestTimeoutMs: 45000,
		});

		expect(writtenRequests).toEqual([
			expect.objectContaining({
				source: "f[x]",
				tabWidth: 4,
				timeoutMs: 45000,
			}),
		]);

		bridge.close();
	});

	it("reuses an already running socket without spawning", async () => {
		connectionPlan = ["connect"];
		const { KernelBridge } = await loadBridge();
		const bridge = new KernelBridge();

		const cst = await bridge.getCST("PacletInfo[]", {});

		expect(cst).toMatchObject(fakeCst);
		expect(spawn).not.toHaveBeenCalled();
		expect(createConnection).toHaveBeenCalledTimes(1);

		bridge.close();
	});

	it("keeps the shared socket connection across requests", async () => {
		connectionPlan = ["error", "connect"];
		const { KernelBridge } = await loadBridge();
		const bridge = new KernelBridge();

		await bridge.getCST("f[x]", {});
		const cst = await bridge.getCST("g[x]", {});

		expect(cst).toMatchObject(fakeCst);
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(createConnection).toHaveBeenCalledTimes(2);
		expect(writtenRequests.map((request) => request.source)).toEqual(["f[x]", "g[x]"]);

		bridge.close();
	});
});

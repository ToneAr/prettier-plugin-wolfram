import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

const kernelName =
	process.platform === "win32" ? "WolframKernel.exe" : "WolframKernel";
const fakeCst = {
	type: "ContainerNode",
	kind: "File",
	children: [],
	source: [
		[1, 1],
		[1, 1],
	],
};

let tempDir = "";
let kernelPath = "";
let spawnMode = "respond";
let spawned = [];

function touch(filePath) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, "");
}

function createMockProcess() {
	const proc = new EventEmitter();
	proc.exitCode = null;
	proc.killed = false;
	proc.stdout = new EventEmitter();
	proc.stdout.setEncoding = vi.fn();
	proc.stderr = new EventEmitter();
	proc.stderr.setEncoding = vi.fn();
	proc.stdin = new EventEmitter();
	proc.stdin.write = vi.fn((payload) => {
		if (payload.includes("__PRETTIER_WL_KERNEL_READY__")) {
			setImmediate(() => {
				proc.stdout.emit("data", "__PRETTIER_WL_KERNEL_READY__\n");
			});
			return true;
		}

		if (spawnMode === "respond") {
			const requestId = payload.match(
				/__PRETTIER_WL_JSON_START__(\d+)__/,
			)?.[1];
			if (requestId) {
				setImmediate(() => {
					proc.stdout.emit(
						"data",
						`__PRETTIER_WL_JSON_START__${requestId}__${JSON.stringify(fakeCst)}__PRETTIER_WL_JSON_END__${requestId}__\n`,
					);
				});
			}
		}

		return true;
	});
	proc.stdin.end = vi.fn();
	proc.kill = vi.fn((signal) => {
		proc.killed = true;
		proc.signalCode = signal;
		proc.exitCode = 0;
		return true;
	});
	spawned.push(proc);
	return proc;
}

const spawn = vi.fn(() => createMockProcess());

vi.mock("child_process", () => ({
	default: { spawn },
	spawn,
}));

async function loadClient() {
	vi.resetModules();
	return import("../../src/bridge/wstpClient.js");
}

async function flushTurns(turns = 1) {
	for (let index = 0; index < turns; index += 1) {
		await new Promise((resolve) => setImmediate(resolve));
	}
}

describe("WstpClient lifecycle", () => {
	beforeEach(() => {
		tempDir = mkdtempSync(path.join(os.tmpdir(), "prettier-wl-wstp-life-"));
		kernelPath = path.join(tempDir, kernelName);
		touch(kernelPath);
		process.env.WOLFRAM_ENGINE_PATH = kernelPath;
		spawnMode = "respond";
		spawned = [];
		spawn.mockClear();
	});

	afterEach(async () => {
		delete process.env.WOLFRAM_ENGINE_PATH;
		rmSync(tempDir, { recursive: true, force: true });

		const { __test__ } = await loadClient();
		__test__.cleanupTrackedClients("test cleanup");
	});

	it("rejects in-flight and queued requests on close without spawning a replacement kernel", async () => {
		spawnMode = "hang";
		const { WstpClient, __test__ } = await loadClient();
		const client = new WstpClient();

		const first = client.getCST("f[x]");
		await flushTurns(3);
		const second = client.getCST("g[x]");
		await flushTurns(1);

		client.close();

		await expect(first).rejects.toSatisfy(__test__.isClientClosedError);
		await expect(second).rejects.toSatisfy(__test__.isClientClosedError);
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(spawned[0].kill).toHaveBeenCalledTimes(1);
	});

	it("closes started kernels during process cleanup", async () => {
		const { WstpClient, __test__ } = await loadClient();
		const client = new WstpClient();

		await expect(client.getCST('Needs["CodeParser`"]')).resolves.toEqual(
			fakeCst,
		);

		__test__.cleanupTrackedClients("Process exiting");

		expect(spawn).toHaveBeenCalledTimes(1);
		expect(spawn).toHaveBeenCalledWith(
			kernelPath,
			["-noinit", "-noprompt"],
			expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
		);
		expect(spawned[0].kill).toHaveBeenCalledTimes(1);
	});

	it("uses the configured request timeout and starts a fresh kernel afterward", async () => {
		spawnMode = "hang";
		const { WstpClient } = await loadClient();
		const client = new WstpClient();

		await expect(
			client.getCST("slow[]", 2, { timeoutMs: 1000 }),
		).rejects.toThrow(/WolframKernel CST request timed out after 1s/);
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(spawned[0].kill).toHaveBeenCalledTimes(1);

		spawnMode = "respond";
		await expect(
			client.getCST("fast[]", 2, { timeoutMs: 1000 }),
		).resolves.toEqual(fakeCst);
		expect(spawn).toHaveBeenCalledTimes(2);

		client.close();
	});
});

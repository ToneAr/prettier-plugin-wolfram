import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import net from "net";
import os from "os";
import path from "path";

const repoRoot = path.resolve(".");
const serverScript = path.join(repoRoot, "scripts", "kernel-server.js");

const spawnedProcesses = [];
const tempDirs = [];

function makeSocketPath(tempDir) {
	if (process.platform !== "win32") return path.join(tempDir, "kernel.sock");
	return `\\\\.\\pipe\\prettier-wl-test-${process.pid}-${Date.now()}-${Math.floor(
		Math.random() * 1_000_000,
	)}`;
}

function spawnKernelServer({ idleTimeoutMs = 50 } = {}) {
	const tempDir = mkdtempSync(path.join(os.tmpdir(), "prettier-wl-server-"));
	tempDirs.push(tempDir);

	const socketPath = makeSocketPath(tempDir);
	const lockPath = path.join(tempDir, "kernel.lock");
	const proc = spawn(process.execPath, [serverScript], {
		cwd: repoRoot,
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			WL_KERNEL_SOCKET: socketPath,
			WL_KERNEL_LOCK: lockPath,
			WL_KERNEL_IDLE_TIMEOUT_MS: String(idleTimeoutMs),
		},
	});
	proc.stdout.setEncoding("utf8");
	proc.stderr.setEncoding("utf8");
	spawnedProcesses.push(proc);

	return { proc, socketPath, lockPath };
}

function waitForReady(proc) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			reject(new Error(`kernel server did not become ready: ${stderr}`));
		}, 2000);
		const cleanup = () => {
			clearTimeout(timer);
			proc.stdout.removeListener("data", onStdout);
			proc.stderr.removeListener("data", onStderr);
			proc.removeListener("exit", onExit);
		};
		const onStdout = (chunk) => {
			stdout += chunk;
			if (stdout.includes("KERNEL_READY")) {
				cleanup();
				resolve();
			}
		};
		const onStderr = (chunk) => {
			stderr += chunk;
		};
		const onExit = (code) => {
			cleanup();
			reject(new Error(`kernel server exited before ready: ${code}`));
		};
		proc.stdout.on("data", onStdout);
		proc.stderr.on("data", onStderr);
		proc.once("exit", onExit);
	});
}

function connectToSocket(socketPath) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		socket.once("connect", () => resolve(socket));
		socket.once("error", reject);
	});
}

function closeSocket(socket) {
	return new Promise((resolve) => {
		socket.once("close", resolve);
		socket.end();
	});
}

function waitForExit(proc) {
	if (proc.exitCode !== null) return Promise.resolve(proc.exitCode);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("kernel server did not exit after idle timeout"));
		}, 2000);
		proc.once("exit", (code) => {
			clearTimeout(timer);
			resolve(code);
		});
	});
}

afterEach(() => {
	for (const proc of spawnedProcesses.splice(0)) {
		if (proc.exitCode === null && !proc.killed) proc.kill("SIGTERM");
	}
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

describe("kernel server lifecycle", () => {
	it("exits after the last connected client disconnects", async () => {
		const { proc, socketPath, lockPath } = spawnKernelServer();

		await waitForReady(proc);
		const socket = await connectToSocket(socketPath);
		await closeSocket(socket);

		await expect(waitForExit(proc)).resolves.toBe(0);
		expect(existsSync(lockPath)).toBe(false);
	});
});

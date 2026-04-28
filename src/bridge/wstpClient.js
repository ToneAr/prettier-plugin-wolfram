// src/bridge/wstpClient.js
import { spawn } from "child_process";
import { createRequire } from "module";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const WL_INIT_PATH = join(__dirname, "init.m");
const WL_INIT = readFileSync(WL_INIT_PATH, "utf8");
const NATIVE_ADDON_PATH = join(
	__dirname,
	"../../wstp-addon/build/Release/wstp.node",
);
const WOLFRAMSCRIPT_START_MARKER = "__PRETTIER_WL_JSON_START__";
const WOLFRAMSCRIPT_END_MARKER = "__PRETTIER_WL_JSON_END__";
const WOLFRAMKERNEL_READY_MARKER = "__PRETTIER_WL_KERNEL_READY__";
const CST_CACHE_TTL_MS = 15000;
const CST_CACHE_MAX_ENTRIES = 8;
const DEFAULT_CST_REQUEST_TIMEOUT_MS = 180000;
const MIN_CST_REQUEST_TIMEOUT_MS = 1000;
const SCRIPT_PROCESS_KILL_SIGNAL =
	process.platform === "win32" ? "SIGTERM" : "SIGKILL";
const CLIENT_CLOSED_ERROR_CODE = "WSTP_CLIENT_CLOSED";
const PROCESS_CLEANUP_STATE_KEY = Symbol.for(
	"prettier-wl.wstpClientProcessCleanup",
);
const processCleanupState =
	globalThis[PROCESS_CLEANUP_STATE_KEY] ??
	(globalThis[PROCESS_CLEANUP_STATE_KEY] = {
		installed: false,
		clients: new Set(),
	});

function createClientClosedError(reason = "WSTP client closed") {
	const error = new Error(reason);
	error.code = CLIENT_CLOSED_ERROR_CODE;
	return error;
}

function isClientClosedError(error) {
	return error?.code === CLIENT_CLOSED_ERROR_CODE;
}

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

function cleanupTrackedClients(
	reason = "Process exiting; closing Wolfram kernels",
) {
	for (const client of Array.from(processCleanupState.clients)) {
		try {
			client.close(reason);
		} catch {}
	}
}

function installProcessCleanupHooks() {
	if (processCleanupState.installed) return;
	processCleanupState.installed = true;

	const cleanup = () => {
		cleanupTrackedClients("Process exiting; closing Wolfram kernels");
	};

	process.once("beforeExit", cleanup);
	process.once("exit", cleanup);
}

function trackClient(client) {
	installProcessCleanupHooks();
	processCleanupState.clients.add(client);
}

function untrackClient(client) {
	processCleanupState.clients.delete(client);
}

function lowerBasename(filePath) {
	return basename(filePath).toLowerCase();
}

function executableNames(kind) {
	const suffix = process.platform === "win32" ? ".exe" : "";
	if (kind === "kernel") return [`WolframKernel${suffix}`];
	return [`wolframscript${suffix}`];
}

function matchesExecutable(filePath, kind) {
	return executableNames(kind)
		.map((name) => name.toLowerCase())
		.includes(lowerBasename(filePath));
}

function findExecutableUnder(rootPath, kind) {
	for (const name of executableNames(kind)) {
		const candidates = [
			join(rootPath, "Executables", name),
			join(rootPath, "MacOS", name),
			join(rootPath, name),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

function parentDirectories(filePath, depth = 3) {
	const roots = [];
	let current = dirname(filePath);
	for (let i = 0; i < depth; i++) {
		roots.push(current);
		const next = dirname(current);
		if (next === current) break;
		current = next;
	}
	return roots;
}

function findExecutableOnPath(kind) {
	const pathEntries = (process.env.PATH ?? "").split(
		process.platform === "win32" ? ";" : ":",
	);

	for (const entry of pathEntries) {
		if (!entry) continue;
		const executable = findExecutableUnder(entry, kind);
		if (executable) return executable;
	}

	return null;
}

function resolveEngineRoot(base) {
	if (!existsSync(base)) return null;
	try {
		const version = readdirSync(base).find((entry) => /^\d+/.test(entry));
		if (version) return join(base, version);
	} catch {}
	return base;
}

function findKernelExecutable(enginePath) {
	if (enginePath) {
		if (!existsSync(enginePath)) {
			throw new Error(`wolframEnginePath does not exist: ${enginePath}`);
		}

		if (existsSync(enginePath) && matchesExecutable(enginePath, "kernel")) {
			return enginePath;
		}

		if (matchesExecutable(enginePath, "script")) {
			for (const root of parentDirectories(enginePath)) {
				const nearby = findExecutableUnder(root, "kernel");
				if (nearby) return nearby;
			}

			const fromPath = findExecutableOnPath("kernel");
			if (fromPath) return fromPath;

			throw new Error(`WolframKernel not found near ${enginePath}`);
		}

		const direct = existsSync(enginePath)
			? findExecutableUnder(enginePath, "kernel")
			: null;
		if (direct) return direct;

		throw new Error(`WolframKernel not found under ${enginePath}`);
	}

	const bases =
		{
			linux: [
				"/usr/local/Wolfram/Mathematica",
				"/usr/local/Wolfram/Wolfram",
				"/usr/local/Wolfram/WolframEngine",
			],
			darwin: [
				"/Applications/Mathematica.app/Contents",
				"/Applications/Wolfram.app/Contents",
				"/Applications/Wolfram Engine.app/Contents",
			],
			win32: [
				"C:\\Program Files\\Wolfram Research\\Mathematica",
				"C:\\Program Files\\Wolfram Research\\Wolfram",
				"C:\\Program Files\\Wolfram Research\\Wolfram Engine",
			],
		}[process.platform] ?? [];

	for (const base of bases) {
		const root = resolveEngineRoot(base);
		if (!root) continue;
		const exe = findExecutableUnder(root, "kernel");
		if (exe) return exe;
	}

	const fromPath = findExecutableOnPath("kernel");
	if (fromPath) return fromPath;

	throw new Error(
		"WolframKernel not found. Set wolframEnginePath option or WOLFRAM_ENGINE_PATH env var.",
	);
}

function defaultWolframScriptCommand() {
	return process.platform === "win32" ? "wolframscript.exe" : "wolframscript";
}

function resolveWolframScriptInvocation(enginePath = "") {
	if (enginePath) {
		if (!existsSync(enginePath)) {
			throw new Error(`wolframEnginePath does not exist: ${enginePath}`);
		}

		if (matchesExecutable(enginePath, "script")) {
			return { command: enginePath, args: [] };
		}

		const bundledScript = findExecutableUnder(enginePath, "script");
		if (bundledScript) return { command: bundledScript, args: [] };

		return {
			command: defaultWolframScriptCommand(),
			args: ["-local", findKernelExecutable(enginePath)],
		};
	}

	return { command: defaultWolframScriptCommand(), args: [] };
}

function resolveNativeAddonPath() {
	return existsSync(NATIVE_ADDON_PATH) ? NATIVE_ADDON_PATH : null;
}

function toWolframString(value) {
	return JSON.stringify(value);
}

function extractMarkedResult(
	stdout = "",
	startMarker = WOLFRAMSCRIPT_START_MARKER,
	endMarker = WOLFRAMSCRIPT_END_MARKER,
) {
	const start = stdout.indexOf(startMarker);
	if (start === -1) return null;
	const resultStart = start + startMarker.length;
	const end = stdout.indexOf(endMarker, resultStart);
	if (end === -1) return null;
	return stdout.slice(resultStart, end);
}

function normalizeSpawnError(error) {
	if (error?.code === "ENOENT") {
		return new Error(
			"WolframKernel not found. Install Wolfram Engine or set wolframEnginePath to a Wolfram install that includes it.",
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}

function kernelResultMarkers(requestId) {
	return {
		start: `${WOLFRAMSCRIPT_START_MARKER}${requestId}__`,
		end: `${WOLFRAMSCRIPT_END_MARKER}${requestId}__`,
	};
}

function buildKernelInitExpression() {
	return [
		`Quiet[Get[${toWolframString(WL_INIT_PATH)}]];`,
		`WriteString[$Output, ${toWolframString(WOLFRAMKERNEL_READY_MARKER)}, "\\n"];`,
		"Flush[$Output];",
	].join("");
}

function buildKernelRequestExpression(sourceText, tabWidth, markers) {
	return [
		`Module[{result = Quiet @ Check[getCSTJSON[${toWolframString(sourceText)}, ${tabWidth}], "null"]},`,
		`WriteString[$Output, ${toWolframString(markers.start)}, Replace[result, Except[_String] -> "null"], ${toWolframString(markers.end)}, "\\n"];`,
		"Flush[$Output]",
		"];",
	].join("");
}

export const __test__ = {
	buildKernelInitExpression,
	buildKernelRequestExpression,
	cleanupTrackedClients,
	extractMarkedResult,
	findKernelExecutable,
	isClientClosedError,
	kernelResultMarkers,
	normalizeCSTRequestTimeoutMs,
	resolveNativeAddonPath,
	resolveWolframScriptInvocation,
	toWolframString,
};

export class WstpClient {
	#kernel = null;
	#initialized = false;
	#enginePath;
	#backend = null;
	#generation = 0;
	#shutdownError = createClientClosedError();
	#startupPromise = null;
	#requestChain = Promise.resolve();
	#resultCache = new Map();
	#inflightRequests = new Map();
	#nativePending = new Set();
	#scriptProcess = null;
	#scriptBuffer = "";
	#scriptPending = null;
	#scriptStartup = null;
	#scriptRequestId = 0;

	constructor(enginePath = "") {
		this.#enginePath = enginePath || process.env.WOLFRAM_ENGINE_PATH || "";
	}

	#assertNotClosed(generation = this.#generation) {
		if (generation !== this.#generation) {
			throw this.#shutdownError;
		}
	}

	#maybeUntrack() {
		if (
			!this.#initialized &&
			!this.#kernel &&
			!this.#scriptProcess &&
			!this.#startupPromise
		) {
			untrackClient(this);
		}
	}

	#rejectNativePending(error) {
		for (const pending of this.#nativePending) {
			pending.reject(error);
		}
		this.#nativePending.clear();
	}

	#failNativeBackend(error) {
		this.#rejectNativePending(error);
		if (this.#kernel) {
			try {
				this.#kernel.close();
			} catch {}
			this.#kernel = null;
		}
		if (this.#backend === "native") {
			this.#backend = null;
			this.#initialized = false;
		}
		this.#maybeUntrack();
	}

	#clearScriptWaiters(error) {
		const pending = this.#scriptPending;
		const startup = this.#scriptStartup;

		this.#scriptPending = null;
		this.#scriptStartup = null;

		if (pending) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}

		if (startup) {
			clearTimeout(startup.timer);
			startup.reject(error);
		}
	}

	async #startBackend(generation) {
		this.#assertNotClosed(generation);

		const nativeAddonPath = resolveNativeAddonPath();
		if (nativeAddonPath) {
			try {
				const { WSTPKernel } = require(nativeAddonPath);
				this.#kernel = new WSTPKernel();
				this.#kernel.launch(findKernelExecutable(this.#enginePath));
				await this.#evalNative(WL_INIT, generation);
				this.#assertNotClosed(generation);
				this.#backend = "native";
				this.#initialized = true;
				return;
			} catch (error) {
				if (this.#kernel) {
					try {
						this.#kernel.close();
					} catch {}
					this.#kernel = null;
				}
				if (isClientClosedError(error)) throw error;
			}
		}

		this.#assertNotClosed(generation);
		await this.#ensureScriptKernel(generation);
		this.#assertNotClosed(generation);
		this.#backend = "script";
		this.#initialized = true;
	}

	async #ensureStarted(generation = this.#generation) {
		this.#assertNotClosed(generation);
		if (this.#initialized) return;
		if (this.#startupPromise) {
			await this.#startupPromise;
			this.#assertNotClosed(generation);
			return;
		}

		trackClient(this);
		const startup = this.#startBackend(generation);
		this.#startupPromise = startup;

		try {
			await startup;
		} finally {
			if (this.#startupPromise === startup) {
				this.#startupPromise = null;
			}
			this.#maybeUntrack();
		}

		this.#assertNotClosed(generation);
	}

	#evalNative(expr, generation = this.#generation, timeoutMs = null) {
		this.#assertNotClosed(generation);
		if (!this.#kernel) {
			return Promise.reject(
				new Error("WolframKernel session is not available"),
			);
		}

		return new Promise((resolve, reject) => {
			let settled = false;
			let timer = null;
			const pending = {
				reject: (error) => settle(reject, error),
			};
			const settle = (handler, value) => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				this.#nativePending.delete(pending);
				handler(value);
			};

			this.#nativePending.add(pending);
			if (timeoutMs !== null) {
				timer = setTimeout(() => {
					this.#failNativeBackend(
						new Error(
							`WolframKernel CST request timed out after ${formatTimeout(timeoutMs)}`,
						),
					);
				}, timeoutMs);
			}

			try {
				this.#kernel.evaluate(expr, (err, result) => {
					if (err) {
						settle(reject, err);
						return;
					}

					try {
						this.#assertNotClosed(generation);
					} catch (error) {
						settle(reject, error);
						return;
					}

					settle(resolve, result);
				});
			} catch (error) {
				settle(reject, error);
			}
		});
	}

	#teardownScriptProcess({ kill = true } = {}) {
		const proc = this.#scriptProcess;
		this.#scriptProcess = null;
		this.#scriptBuffer = "";
		this.#scriptRequestId = 0;

		if (!proc) return;

		proc.stdout?.removeAllListeners("data");
		proc.stderr?.removeAllListeners("data");
		proc.stdin?.removeAllListeners("error");
		proc.removeAllListeners("error");
		proc.removeAllListeners("exit");

		try {
			proc.stdin?.end?.();
		} catch {}

		if (kill && proc.exitCode == null) {
			try {
				proc.kill(SCRIPT_PROCESS_KILL_SIGNAL);
			} catch {}
		}
	}

	#failScriptBackend(error) {
		const normalized = normalizeSpawnError(error);

		this.#clearScriptWaiters(normalized);
		this.#teardownScriptProcess();
		if (this.#backend === "script") {
			this.#backend = null;
			this.#initialized = false;
		}
		this.#maybeUntrack();
	}

	#drainScriptBuffer() {
		const pending = this.#scriptPending;
		if (!pending) return;

		const result = extractMarkedResult(
			this.#scriptBuffer,
			pending.markers.start,
			pending.markers.end,
		);
		if (result === null) return;

		const end = this.#scriptBuffer.indexOf(pending.markers.end);
		this.#scriptBuffer = this.#scriptBuffer.slice(
			end + pending.markers.end.length,
		);

		clearTimeout(pending.timer);
		this.#scriptPending = null;
		pending.resolve(result);
	}

	#attachScriptProcess(proc) {
		proc.stdout.setEncoding("utf8");
		proc.stderr.setEncoding("utf8");

		proc.stdout.on("data", (chunk) => {
			this.#scriptBuffer += chunk;

			const startup = this.#scriptStartup;
			if (startup) {
				const readyIndex = this.#scriptBuffer.indexOf(
					WOLFRAMKERNEL_READY_MARKER,
				);
				if (readyIndex !== -1) {
					this.#scriptBuffer = this.#scriptBuffer.slice(
						readyIndex + WOLFRAMKERNEL_READY_MARKER.length,
					);
					clearTimeout(startup.timer);
					this.#scriptStartup = null;
					startup.resolve();
				}
			}

			this.#drainScriptBuffer();
		});

		proc.stderr.on("data", (chunk) => {
			const startup = this.#scriptStartup;
			if (startup) {
				startup.stderr += chunk;
			}
			if (this.#scriptPending) {
				this.#scriptPending.stderr += chunk;
			}
		});

		proc.stdin.on("error", (error) => {
			this.#failScriptBackend(error);
		});

		proc.once("error", (error) => {
			this.#failScriptBackend(error);
		});

		proc.once("exit", (code, signal) => {
			const startupStderr = this.#scriptStartup?.stderr?.trim?.() ?? "";
			const pendingStderr = this.#scriptPending?.stderr?.trim?.() ?? "";
			const details = [pendingStderr, startupStderr]
				.filter(Boolean)
				.join("\n");
			const reason =
				details ||
				`WolframKernel exited unexpectedly (${signal ?? code ?? "unknown"})`;
			this.#failScriptBackend(new Error(reason));
		});
	}

	#ensureScriptKernel(generation = this.#generation) {
		this.#assertNotClosed(generation);
		if (this.#scriptProcess && !this.#scriptStartup)
			return Promise.resolve();
		if (this.#scriptStartup) {
			return this.#scriptStartup.promise.then(() => {
				this.#assertNotClosed(generation);
			});
		}

		const kernelPath = findKernelExecutable(this.#enginePath);
		const proc = spawn(kernelPath, ["-noinit", "-noprompt"], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.#scriptProcess = proc;
		this.#scriptBuffer = "";
		this.#attachScriptProcess(proc);

		let resolveStartup;
		let rejectStartup;
		const promise = new Promise((resolve, reject) => {
			resolveStartup = resolve;
			rejectStartup = reject;
		});

		const timer = setTimeout(() => {
			this.#failScriptBackend(
				new Error("WolframKernel CST session timed out after 90s"),
			);
		}, 90000);

		this.#scriptStartup = {
			promise,
			resolve: resolveStartup,
			reject: rejectStartup,
			timer,
			stderr: "",
		};

		try {
			proc.stdin.write(buildKernelInitExpression() + "\n");
		} catch (error) {
			this.#failScriptBackend(error);
		}

		return promise.then(() => {
			this.#assertNotClosed(generation);
		});
	}

	async #evalScript(
		sourceText,
		tabWidth,
		timeoutMs,
		generation = this.#generation,
	) {
		this.#assertNotClosed(generation);
		await this.#ensureScriptKernel(generation);
		this.#assertNotClosed(generation);
		if (!this.#scriptProcess) {
			throw new Error("WolframKernel session is not available");
		}

		const requestId = ++this.#scriptRequestId;
		const markers = kernelResultMarkers(requestId);
		const expr = buildKernelRequestExpression(
			sourceText,
			tabWidth,
			markers,
		);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#failScriptBackend(
					new Error(
						`WolframKernel CST request timed out after ${formatTimeout(timeoutMs)}`,
					),
				);
			}, timeoutMs);

			this.#scriptPending = {
				markers,
				resolve,
				reject,
				timer,
				stderr: "",
			};

			try {
				this.#scriptProcess.stdin.write(expr + "\n");
			} catch (error) {
				clearTimeout(timer);
				this.#scriptPending = null;
				reject(error);
			}
		});
	}

	#cacheKey(sourceText, tabWidth) {
		return `${tabWidth}\u0000${sourceText}`;
	}

	#cachedRawResult(key) {
		const entry = this.#resultCache.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= Date.now()) {
			this.#resultCache.delete(key);
			return undefined;
		}

		// Refresh insertion order to approximate LRU behavior.
		this.#resultCache.delete(key);
		this.#resultCache.set(key, entry);
		return entry.raw;
	}

	#storeRawResult(key, raw) {
		if (this.#resultCache.has(key)) {
			this.#resultCache.delete(key);
		}

		this.#resultCache.set(key, {
			raw,
			expiresAt: Date.now() + CST_CACHE_TTL_MS,
		});

		while (this.#resultCache.size > CST_CACHE_MAX_ENTRIES) {
			const oldestKey = this.#resultCache.keys().next().value;
			this.#resultCache.delete(oldestKey);
		}
	}

	#parseRawResult(raw) {
		if (raw == null || raw === "null") return null;
		return JSON.parse(raw);
	}

	async #getCSTRawInternal(
		sourceText,
		tabWidth,
		timeoutMs,
		generation = this.#generation,
	) {
		this.#assertNotClosed(generation);
		if (this.#backend === "native") {
			const result = await this.#evalNative(
				`getCSTJSON[${toWolframString(sourceText)}, ${tabWidth}]`,
				generation,
				timeoutMs,
			);
			this.#assertNotClosed(generation);
			return !result || result === "null" ? null : result;
		}

		const result = await this.#evalScript(
			sourceText,
			tabWidth,
			timeoutMs,
			generation,
		);
		this.#assertNotClosed(generation);
		return !result || result === "null" ? null : result;
	}

	async getCST(sourceText, tabWidth = 2, options = {}) {
		const generation = this.#generation;
		this.#assertNotClosed(generation);
		await this.#ensureStarted(generation);
		this.#assertNotClosed(generation);
		const timeoutMs = normalizeCSTRequestTimeoutMs(
			typeof options === "number"
				? options
				: (options.timeoutMs ?? options.wolframCSTRequestTimeoutMs),
		);

		const key = this.#cacheKey(sourceText, tabWidth);
		const cached = this.#cachedRawResult(key);
		if (cached !== undefined) return this.#parseRawResult(cached);

		const inflight = this.#inflightRequests.get(key);
		if (inflight?.generation === generation) {
			return inflight.promise.then((raw) => this.#parseRawResult(raw));
		}

		let resolveShared;
		let rejectShared;
		const sharedTask = new Promise((resolve, reject) => {
			resolveShared = resolve;
			rejectShared = reject;
		});
		const inflightEntry = { generation, promise: sharedTask };
		this.#inflightRequests.set(key, inflightEntry);

		const rawTask = this.#requestChain.then(() => {
			this.#assertNotClosed(generation);
			return this.#getCSTRawInternal(
				sourceText,
				tabWidth,
				timeoutMs,
				generation,
			);
		});
		this.#requestChain = rawTask.catch(() => {});

		rawTask
			.then((raw) => {
				this.#assertNotClosed(generation);
				this.#storeRawResult(key, raw);
				resolveShared(raw);
			})
			.catch((error) => {
				rejectShared(error);
			})
			.finally(() => {
				if (this.#inflightRequests.get(key) === inflightEntry) {
					this.#inflightRequests.delete(key);
				}
			});

		return sharedTask.then((raw) => this.#parseRawResult(raw));
	}

	close(reason = "WSTP client closed") {
		const error = isClientClosedError(reason)
			? reason
			: createClientClosedError(reason);

		this.#generation += 1;
		this.#shutdownError = error;
		this.#clearScriptWaiters(error);
		this.#rejectNativePending(error);
		this.#startupPromise = null;

		if (this.#kernel) {
			try {
				this.#kernel.close();
			} catch {}
			this.#kernel = null;
		}
		this.#teardownScriptProcess();
		this.#backend = null;
		this.#initialized = false;
		this.#requestChain = Promise.resolve();
		this.#resultCache.clear();
		this.#inflightRequests.clear();
		untrackClient(this);
	}
}

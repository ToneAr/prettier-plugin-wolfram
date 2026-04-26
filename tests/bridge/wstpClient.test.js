import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

const scriptName = process.platform === "win32" ? "wolframscript.exe" : "wolframscript";
const kernelName = process.platform === "win32" ? "WolframKernel.exe" : "WolframKernel";

function touch(filePath) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, "");
}

async function loadTestHelpers() {
	vi.resetModules();
	return (await import("../../src/bridge/wstpClient.js")).__test__;
}

describe("wstpClient executable resolution", () => {
	let tempDir = "";

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(os.tmpdir(), "prettier-wl-wstp-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("prefers a directly configured wolframscript executable", async () => {
		const scriptPath = path.join(tempDir, scriptName);
		touch(scriptPath);
		const { resolveWolframScriptInvocation } = await loadTestHelpers();

		expect(resolveWolframScriptInvocation(scriptPath)).toEqual({
			command: scriptPath,
			args: [],
		});
	});

	it("finds a sibling WolframKernel for a configured wolframscript executable", async () => {
		const scriptPath = path.join(tempDir, "Executables", scriptName);
		const kernelPath = path.join(tempDir, "Executables", kernelName);
		touch(scriptPath);
		touch(kernelPath);
		const { findKernelExecutable } = await loadTestHelpers();

		expect(findKernelExecutable(scriptPath)).toBe(kernelPath);
	});

	it("finds wolframscript inside an engine directory", async () => {
		const engineRoot = path.join(tempDir, "WolframEngine");
		const scriptPath = path.join(engineRoot, "Executables", scriptName);
		touch(scriptPath);
		const { resolveWolframScriptInvocation } = await loadTestHelpers();

		expect(resolveWolframScriptInvocation(engineRoot)).toEqual({
			command: scriptPath,
			args: [],
		});
	});

	it("uses -local with a configured kernel executable when no wolframscript binary is present", async () => {
		const kernelPath = path.join(tempDir, kernelName);
		touch(kernelPath);
		const { resolveWolframScriptInvocation } = await loadTestHelpers();

		expect(resolveWolframScriptInvocation(kernelPath)).toEqual({
			command: scriptName,
			args: ["-local", kernelPath],
		});
	});

	it("fails fast for a missing configured path", async () => {
		const { resolveWolframScriptInvocation } = await loadTestHelpers();

		expect(() =>
			resolveWolframScriptInvocation(path.join(tempDir, "missing-engine")),
		).toThrow(/wolframEnginePath does not exist/);
	});

	it("extracts marker-wrapped JSON from noisy wolframscript output", async () => {
		const { extractMarkedResult } = await loadTestHelpers();

		expect(
			extractMarkedResult(
				'warning\n__PRETTIER_WL_JSON_START__{"type":"ContainerNode"}__PRETTIER_WL_JSON_END__\n',
			),
		).toBe('{"type":"ContainerNode"}');
	});
});

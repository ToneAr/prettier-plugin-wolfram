import { describe, it, expect } from "vitest";
import { resolveDocumentContext } from "../../vscode-extension/src/documentContext.js";

function fileDocument(fsPath) {
	return { uri: { scheme: "file", fsPath } };
}

function untitledDocument(fsPath = "/Untitled-1") {
	return { uri: { scheme: "untitled", fsPath } };
}

describe("resolveDocumentContext", () => {
	it("resolves a saved file to its path and enclosing workspace folder", () => {
		const document = fileDocument("/repo/pkg/a.wl");
		const ctx = resolveDocumentContext(document, {
			getWorkspaceFolder: () => ({ uri: { fsPath: "/repo" } }),
			workspaceFolders: [{ uri: { fsPath: "/repo" } }],
		});

		expect(ctx).toEqual({
			filePath: "/repo/pkg/a.wl",
			workspaceFolder: "/repo",
			isRealFile: true,
		});
	});

	it("falls back to the file's directory when it belongs to no workspace folder", () => {
		const document = fileDocument("/scratch/a.wl");
		const ctx = resolveDocumentContext(document, {
			getWorkspaceFolder: () => undefined,
			workspaceFolders: undefined,
		});

		expect(ctx).toEqual({
			filePath: "/scratch/a.wl",
			workspaceFolder: "/scratch",
			isRealFile: true,
		});
	});

	it("treats an unsaved buffer as pathless and uses the first workspace folder", () => {
		const document = untitledDocument();
		const ctx = resolveDocumentContext(document, {
			getWorkspaceFolder: () => undefined,
			workspaceFolders: [{ uri: { fsPath: "/repo" } }],
		});

		expect(ctx).toEqual({
			filePath: null,
			workspaceFolder: "/repo",
			isRealFile: false,
		});
	});

	it("leaves the workspace folder null for an unsaved buffer with no folder open", () => {
		const document = untitledDocument();
		const ctx = resolveDocumentContext(document, {
			getWorkspaceFolder: () => undefined,
			workspaceFolders: undefined,
		});

		expect(ctx).toEqual({
			filePath: null,
			workspaceFolder: null,
			isRealFile: false,
		});
	});
});

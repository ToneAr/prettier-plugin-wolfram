"use strict";

const path = require("path");

// Derives the on-disk context a document needs for Prettier config and plugin
// resolution. Saved files ("file" scheme) have a real path and an enclosing
// workspace folder; unsaved buffers ("untitled" and other virtual schemes) have
// neither, so we surface filePath: null and let callers fall back to bundled
// defaults.

function resolveDocumentContext(document, deps = {}) {
	if (document.uri.scheme !== "file") {
		const workspaceFolder = deps.workspaceFolders?.[0]?.uri.fsPath ?? null;
		return { filePath: null, workspaceFolder, isRealFile: false };
	}

	const filePath = document.uri.fsPath;
	const workspaceFolder =
		deps.getWorkspaceFolder?.(document.uri)?.uri.fsPath ??
		path.dirname(filePath);
	return { filePath, workspaceFolder, isRealFile: true };
}

module.exports = { resolveDocumentContext };

// vscode-extension/extension.js
//
// Registers document and range format providers for Wolfram Language files.
// Range formatting is derived from full-document Prettier output and then
// mapped back onto the selected top-level forms, because Prettier core only
// expands ranges for a fixed set of built-in parsers.
//
// Installation: add this folder to your workspace's .vscode/extensions or
// symlink it into ~/.vscode/extensions/wolfram-prettier-range-0.1.0.

"use strict";
const vscode = require("vscode");
const path = require("path");
const { pathToFileURL } = require("url");
const fs = require("fs");
const {
	APPLY_DOCUMENT_FORMATTING_COMMAND,
	APPLY_RANGE_FORMATTING_COMMAND,
	provideFormattingCodeActions,
} = require("./codeActions");
const diagnosticRanges = require("./diagnosticRanges");
const {
	DEFAULT_DIAGNOSTIC_SEVERITY,
	diagnosticSeverityFromConfig,
} = require("./diagnosticSeverity");
const {
	currentGeneration,
	isWolframFileDocument,
	scheduleDiagnostics,
} = require("./diagnosticRefresh");
const { mergeConfiguredPlugins, resolveProjectConfig } = require("./config");
const {
	classifyFormattingHunk,
	differsOnlyByFinalNewline,
} = require("./formattingDiagnostics");
const { buildFormattingEditPlan } = require("./formatting");

const output = vscode.window.createOutputChannel("Prettier (Wolfram)");
const refreshTimers = new Map();
const refreshGenerations = new Map();
const activeDiagnostics = new Map();
const pendingDiagnostics = new Map();
const pluginModuleCache = new Map();
const extensionRoot = __dirname;
const pluginPackages = [
	"@wrel/prettier-plugin-wolfram",
	"prettier-plugin-wolfram",
];
const CHANGE_DIAGNOSTIC_DELAY_MS = 500;
const DEFAULT_CST_REQUEST_TIMEOUT_MS = 180000;

function firstNonEmptyPath(...values) {
	for (const value of values) {
		if (typeof value !== "string") continue;
		if (value.trim()) return value;
	}
	return "";
}

function configuredKernelPath() {
	return firstNonEmptyPath(
		vscode.workspace
			.getConfiguration("wolframPrettier")
			.get("wolframEnginePath"),
		vscode.workspace.getConfiguration("wolfram").get("systemKernel"),
	);
}

function configuredCSTRequestTimeoutMs() {
	const configured = vscode.workspace
		.getConfiguration("wolframPrettier")
		.get("cstRequestTimeoutMs", DEFAULT_CST_REQUEST_TIMEOUT_MS);
	const numeric = Number(configured);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return DEFAULT_CST_REQUEST_TIMEOUT_MS;
	}
	return Math.floor(numeric);
}

function mergeExtensionFormatterOptions(resolvedConfig = {}) {
	return {
		wolframCSTRequestTimeoutMs: configuredCSTRequestTimeoutMs(),
		wolframEnginePath: configuredKernelPath(),
		...resolvedConfig,
	};
}

function log(message) {
	output.appendLine(message);
}

function formatterDiagnosticSeverity() {
	const configuredSeverity = vscode.workspace
		.getConfiguration("wolframPrettier")
		.get("diagnosticSeverity", DEFAULT_DIAGNOSTIC_SEVERITY);

	return diagnosticSeverityFromConfig(vscode, configuredSeverity);
}

function resolvePackagedPlugin(requestPaths) {
	for (const packageName of pluginPackages) {
		try {
			return require.resolve(packageName, { paths: requestPaths });
		} catch {
			// Try the next known package name.
		}
	}

	return null;
}

function resolveWorkspacePluginEntries(workspaceFolder) {
	const workspacePackagePath = path.join(workspaceFolder, "package.json");
	if (!fs.existsSync(workspacePackagePath)) return null;

	try {
		const workspacePackage = JSON.parse(
			fs.readFileSync(workspacePackagePath, "utf8"),
		);
		if (!pluginPackages.includes(workspacePackage.name)) return null;
	} catch {
		return null;
	}

	const pluginEntry = path.join(workspaceFolder, "src", "index.js");
	const rulesEntry = path.join(workspaceFolder, "src", "rules", "index.js");
	if (!fs.existsSync(pluginEntry)) return null;

	return {
		pluginEntry,
		rulesEntry: fs.existsSync(rulesEntry) ? rulesEntry : null,
	};
}

function resolveDirectDependency(packageName, workspaceFolder) {
	const packageJsonPath = path.join(
		workspaceFolder,
		"node_modules",
		packageName,
		"package.json",
	);
	if (!fs.existsSync(packageJsonPath)) return null;

	try {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const entry = pkg.main ?? "index.js";
		const resolved = path.join(path.dirname(packageJsonPath), entry);
		return fs.existsSync(resolved) ? resolved : null;
	} catch {
		return null;
	}
}

function resolveDirectWorkspacePlugin(workspaceFolder) {
	for (const packageName of pluginPackages) {
		const entry = resolveDirectDependency(packageName, workspaceFolder);
		if (entry) return entry;
	}
	return null;
}

function resolveBundledPlugin() {
	return resolvePackagedPlugin([extensionRoot]);
}

function resolveDirectWorkspacePrettier(workspaceFolder) {
	return resolveDirectDependency("prettier", workspaceFolder);
}

async function resolveFormatterContext(workspaceFolder, filePath) {
	const workspacePrettierPath =
		resolveDirectWorkspacePrettier(workspaceFolder);
	const bundledPrettierPath = require.resolve("prettier", {
		paths: [extensionRoot],
	});
	const prettierPath = workspacePrettierPath ?? bundledPrettierPath;

	let prettier;
	try {
		prettier = require(prettierPath);
	} catch {
		return null;
	}

	let pluginPath = null;
	const workspacePlugin = resolveWorkspacePluginEntries(workspaceFolder);
	if (workspacePlugin?.pluginEntry) {
		pluginPath = workspacePlugin.pluginEntry;
	} else {
		pluginPath =
			resolveDirectWorkspacePlugin(workspaceFolder) ??
			resolveBundledPlugin();
	}

	if (!pluginPath) return null;

	const resolvedConfig = await resolveProjectConfig(prettier, filePath);
	const formatterConfig = mergeExtensionFormatterOptions(resolvedConfig);
	const plugins = mergeConfiguredPlugins(formatterConfig, pluginPath);
	return { prettier, pluginPath, plugins, resolvedConfig: formatterConfig };
}

async function loadFormatterPlugin(pluginPath) {
	if (!pluginModuleCache.has(pluginPath)) {
		pluginModuleCache.set(
			pluginPath,
			import(pathToFileURL(pluginPath).href),
		);
	}

	return pluginModuleCache.get(pluginPath);
}

function formatOptionsForDocument(document, ctx) {
	return {
		...ctx.resolvedConfig,
		filepath: document.uri.fsPath,
		parser: "wolfram",
		plugins: ctx.plugins,
	};
}

async function getFormattedText(document) {
	const workspaceFolder =
		vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
		path.dirname(document.uri.fsPath);

	const ctx = await resolveFormatterContext(
		workspaceFolder,
		document.uri.fsPath,
	);
	if (!ctx) {
		vscode.window.showErrorMessage(
			"wolfram-prettier-range: Could not resolve Prettier and the Wolfram plugin " +
				"from the workspace or the bundled extension runtime.",
		);
		return null;
	}

	const { prettier } = ctx;
	const text = document.getText();

	return prettier.format(text, formatOptionsForDocument(document, ctx));
}

async function getFormattingPlan(document, range) {
	const workspaceFolder =
		vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
		path.dirname(document.uri.fsPath);

	const ctx = await resolveFormatterContext(
		workspaceFolder,
		document.uri.fsPath,
	);
	if (!ctx) {
		vscode.window.showErrorMessage(
			"wolfram-prettier-range: Could not resolve Prettier and the Wolfram plugin " +
				"from the workspace or the bundled extension runtime.",
		);
		return null;
	}

	return buildFormattingEditPlan({
		text: document.getText(),
		filePath: document.uri.fsPath,
		range,
		prettier: ctx.prettier,
		resolvedConfig: ctx.resolvedConfig,
		plugins: ctx.plugins,
		pluginModule: await loadFormatterPlugin(ctx.pluginPath),
		positionToOffset: (position) => document.offsetAt(position),
	});
}

function diffLineHunks(original, formatted) {
	return diagnosticRanges.diffLineHunks(original, formatted);
}

function rangesOverlap(a, b) {
	return !(a.end.isBeforeOrEqual(b.start) || b.end.isBeforeOrEqual(a.start));
}

function diagnosticRangeForFinding(document, ast, finding) {
	return diagnosticRanges.diagnosticRangeForFinding(
		vscode,
		document,
		ast,
		finding,
	);
}

function diagnosticRangeForHunk(document, ast, hunk) {
	return diagnosticRanges.diagnosticRangeForHunk(vscode, document, ast, hunk);
}

async function formatWithPrettier(document, range) {
	let plan;
	try {
		plan = await getFormattingPlan(document, range);
	} catch (err) {
		vscode.window.showErrorMessage(
			"wolfram-prettier-range: " + err.message,
		);
		return [];
	}

	if (!plan) return [];

	return [
		vscode.TextEdit.replace(
			new vscode.Range(
				document.positionAt(plan.replaceStart),
				document.positionAt(plan.replaceEnd),
			),
			plan.replacementText,
		),
	];
}

async function applyTextEdits(uri, edits) {
	if (!edits || edits.length === 0) return false;

	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.set(uri, edits);
	return vscode.workspace.applyEdit(workspaceEdit);
}

async function applyDocumentFormatting(uri, range, collection) {
	await vscode.workspace.openTextDocument(uri);
	if (range) {
		const edits = await vscode.commands.executeCommand(
			"vscode.executeFormatRangeProvider",
			uri,
			range,
			{
				insertSpaces: true,
				tabSize: 2,
			},
		);
		const applied = await applyTextEdits(uri, edits ?? []);
		const latestDocument = await vscode.workspace.openTextDocument(uri);
		scheduleDiagnostics({
			document: latestDocument,
			collection,
			refreshTimers,
			refreshGenerations,
			activeDiagnostics,
			pendingDiagnostics,
			delay: 0,
			clearExisting: true,
			collectDiagnostics,
			log,
		});
		return applied;
	}

	const edits = await vscode.commands.executeCommand(
		"vscode.executeFormatDocumentProvider",
		uri,
		{
			insertSpaces: true,
			tabSize: 2,
		},
	);
	const applied = await applyTextEdits(uri, edits ?? []);
	const latestDocument = await vscode.workspace.openTextDocument(uri);
	scheduleDiagnostics({
		document: latestDocument,
		collection,
		refreshTimers,
		refreshGenerations,
		activeDiagnostics,
		pendingDiagnostics,
		delay: 0,
		clearExisting: true,
		collectDiagnostics,
		log,
	});
	return applied;
}

async function collectDiagnostics(document, collection, generation) {
	if (!isWolframFileDocument(document)) return;
	const uriKey = document.uri.toString();
	const isStale = () =>
		currentGeneration(refreshGenerations, uriKey) !== generation;

	try {
		const diagnosticSeverity = formatterDiagnosticSeverity();
		log(`collectDiagnostics: ${document.uri.fsPath}`);
		const workspaceFolder =
			vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
			path.dirname(document.uri.fsPath);
		const ctx = await resolveFormatterContext(
			workspaceFolder,
			document.uri.fsPath,
		);
		if (isStale()) {
			log("collectDiagnostics: stale after resolveFormatterContext");
			return;
		}
		if (!ctx) {
			log("collectDiagnostics: no formatter context");
			collection.set(document.uri, []);
			return;
		}

		const original = document.getText();
		const formatted = await getFormattedText(document);
		if (isStale()) {
			log("collectDiagnostics: stale after formatting");
			return;
		}
		if (
			formatted == null ||
			formatted === original ||
			differsOnlyByFinalNewline(original, formatted)
		) {
			log("collectDiagnostics: no formatting diff");
			collection.set(document.uri, []);
			return;
		}

		const workspacePlugin = resolveWorkspacePluginEntries(workspaceFolder);

		let pluginModuleUrl;
		let rulesModuleUrl;
		if (workspacePlugin?.pluginEntry && workspacePlugin.rulesEntry) {
			pluginModuleUrl = pathToFileURL(workspacePlugin.pluginEntry).href;
			rulesModuleUrl = pathToFileURL(workspacePlugin.rulesEntry).href;
		} else {
			const bundledPluginEntry = resolvePackagedPlugin([extensionRoot]);
			if (!bundledPluginEntry)
				throw new Error(
					"Could not resolve bundled Wolfram Prettier plugin",
				);
			const bundledPluginDir = path.dirname(bundledPluginEntry);
			pluginModuleUrl = pathToFileURL(bundledPluginEntry).href;
			rulesModuleUrl = pathToFileURL(
				path.join(bundledPluginDir, "rules", "index.js"),
			).href;
		}

		const plugin = await import(pluginModuleUrl);
		const { runRules } = await import(rulesModuleUrl);

		const ast = await plugin.parsers.wolfram.parse(
			original,
			ctx.resolvedConfig,
		);
		if (isStale()) {
			log("collectDiagnostics: stale after parse");
			return;
		}
		const findings = await runRules(
			ast,
			{},
			{ ...ctx.resolvedConfig, __sourceText: original },
		);
		if (isStale()) {
			log("collectDiagnostics: stale after rules");
			return;
		}
		log(`collectDiagnostics: findings=${findings.length}`);

		const ruleDiagnostics = findings
			.filter((finding) => finding.fixableByFormatter)
			.map((finding) => {
				const range = diagnosticRangeForFinding(document, ast, finding);
				const diagnostic = new vscode.Diagnostic(
					range,
					finding.message,
					diagnosticSeverity,
				);
				diagnostic.source = `prettier-wolfram:${finding.rule}`;
				diagnostic.code = finding.rule;
				return diagnostic;
			});

		const diffDiagnostics = diffLineHunks(original, formatted)
			.map((hunk) => {
				const range = diagnosticRangeForHunk(document, ast, hunk);
				if (ruleDiagnostics.some((d) => rangesOverlap(d.range, range)))
					return null;
				const diagnostic = new vscode.Diagnostic(
					range,
					classifyFormattingHunk(hunk, ctx.resolvedConfig.printWidth),
					diagnosticSeverity,
				);
				diagnostic.source = "prettier-wolfram:format";
				diagnostic.code = "format-diff";
				return diagnostic;
			})
			.filter(Boolean);

		log(
			`collectDiagnostics: ruleDiagnostics=${ruleDiagnostics.length} diffDiagnostics=${diffDiagnostics.length}`,
		);

		collection.set(document.uri, [...ruleDiagnostics, ...diffDiagnostics]);
	} catch (err) {
		log(`collectDiagnostics error: ${err?.stack ?? err}`);
		if (!isStale()) {
			collection.set(document.uri, []);
		}
	}
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
	const wolframEnginePath = configuredKernelPath();
	if (wolframEnginePath) {
		process.env.WOLFRAM_ENGINE_PATH = wolframEnginePath;
	}

	const selector = { language: "wolfram", scheme: "file" };
	const diagnostics =
		vscode.languages.createDiagnosticCollection("prettier-wolfram");

	const applyDocumentFormattingCommand = vscode.commands.registerCommand(
		APPLY_DOCUMENT_FORMATTING_COMMAND,
		(uri) => applyDocumentFormatting(uri, undefined, diagnostics),
	);

	const applyRangeFormattingCommand = vscode.commands.registerCommand(
		APPLY_RANGE_FORMATTING_COMMAND,
		(uri, range) => applyDocumentFormatting(uri, range, diagnostics),
	);

	const documentProvider =
		vscode.languages.registerDocumentFormattingEditProvider(selector, {
			async provideDocumentFormattingEdits(
				document,
				_formattingOptions,
				_token,
			) {
				return formatWithPrettier(document);
			},
		});

	const provider =
		vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
			async provideDocumentRangeFormattingEdits(
				document,
				range,
				_formattingOptions,
				_token,
			) {
				return formatWithPrettier(document, range);
			},
		});

	const codeActionProvider = vscode.languages.registerCodeActionsProvider(
		selector,
		{
			provideCodeActions(document, range, context) {
				return provideFormattingCodeActions(
					vscode,
					document,
					range,
					context,
				);
			},
		},
		{
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
		},
	);

	const openSub = vscode.workspace.onDidOpenTextDocument((document) =>
		scheduleDiagnostics({
			document,
			collection: diagnostics,
			refreshTimers,
			refreshGenerations,
			activeDiagnostics,
			pendingDiagnostics,
			delay: 50,
			collectDiagnostics,
			log,
		}),
	);
	const changeSub = vscode.workspace.onDidChangeTextDocument((event) =>
		scheduleDiagnostics({
			document: event.document,
			collection: diagnostics,
			refreshTimers,
			refreshGenerations,
			activeDiagnostics,
			pendingDiagnostics,
			delay: CHANGE_DIAGNOSTIC_DELAY_MS,
			clearExisting: true,
			collectDiagnostics,
			log,
		}),
	);
	const saveSub = vscode.workspace.onDidSaveTextDocument((document) =>
		scheduleDiagnostics({
			document,
			collection: diagnostics,
			refreshTimers,
			refreshGenerations,
			activeDiagnostics,
			pendingDiagnostics,
			delay: 0,
			collectDiagnostics,
			log,
		}),
	);
	const closeSub = vscode.workspace.onDidCloseTextDocument((document) => {
		const uriKey = document.uri.toString();
		const existingTimer = refreshTimers.get(uriKey);
		if (existingTimer) clearTimeout(existingTimer);
		refreshTimers.delete(uriKey);
		refreshGenerations.delete(uriKey);
		activeDiagnostics.delete(uriKey);
		pendingDiagnostics.delete(uriKey);
		diagnostics.delete(document.uri);
	});

	vscode.workspace.textDocuments.forEach((document) =>
		scheduleDiagnostics({
			document,
			collection: diagnostics,
			refreshTimers,
			refreshGenerations,
			activeDiagnostics,
			pendingDiagnostics,
			delay: 0,
			collectDiagnostics,
			log,
		}),
	);

	context.subscriptions.push(
		applyDocumentFormattingCommand,
		applyRangeFormattingCommand,
		documentProvider,
		provider,
		codeActionProvider,
		diagnostics,
		openSub,
		changeSub,
		saveSub,
		closeSub,
		output,
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
	__test__: {
		...diagnosticRanges,
	},
};

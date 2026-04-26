"use strict";

const APPLY_DOCUMENT_FORMATTING_COMMAND =
	"prettier-wolfram.applyDocumentFormatting";
const APPLY_RANGE_FORMATTING_COMMAND = "prettier-wolfram.applyRangeFormatting";

function isPrettierWolframDiagnostic(diagnostic) {
	return (
		typeof diagnostic?.source === "string" &&
		diagnostic.source.startsWith("prettier-wolfram:")
	);
}

function preferredRange(requestedRange, diagnostics) {
	if (diagnostics.length === 1 && diagnostics[0]?.range)
		return diagnostics[0].range;
	return requestedRange ?? diagnostics[0]?.range ?? null;
}

function provideFormattingCodeActions(vscodeApi, document, range, context) {
	const diagnostics = (context?.diagnostics ?? []).filter(
		isPrettierWolframDiagnostic,
	);
	if (diagnostics.length === 0) return [];

	const actions = [];
	const targetRange = preferredRange(range, diagnostics);

	if (targetRange) {
		const rangeAction = new vscodeApi.CodeAction(
			"Apply Prettier formatting to this range",
			vscodeApi.CodeActionKind.QuickFix,
		);
		rangeAction.command = {
			title: rangeAction.title,
			command: APPLY_RANGE_FORMATTING_COMMAND,
			arguments: [document.uri, targetRange],
		};
		rangeAction.diagnostics = diagnostics;
		rangeAction.isPreferred = true;
		actions.push(rangeAction);
	}

	const documentAction = new vscodeApi.CodeAction(
		"Apply Prettier formatting to document",
		vscodeApi.CodeActionKind.QuickFix,
	);
	documentAction.command = {
		title: documentAction.title,
		command: APPLY_DOCUMENT_FORMATTING_COMMAND,
		arguments: [document.uri],
	};
	documentAction.diagnostics = diagnostics;
	actions.push(documentAction);

	return actions;
}

module.exports = {
	APPLY_DOCUMENT_FORMATTING_COMMAND,
	APPLY_RANGE_FORMATTING_COMMAND,
	isPrettierWolframDiagnostic,
	provideFormattingCodeActions,
};

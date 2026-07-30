import { normalizeWolframOptions } from "../options.js";

const DEFAULT_MAX_BLANK_LINES_BETWEEN_CODE = 1;
const DEFAULT_BLANK_LINES_BETWEEN_DEFINITIONS = 1;
const DEFAULT_BLANK_LINES_BETWEEN_SAME_NAME_DEFINITIONS = 0;

const SET_DECLARATION_OPS = new Set(["Set", "TagSet", "UpSet"]);
const SET_DELAYED_DECLARATION_OPS = new Set([
	"SetDelayed",
	"TagSetDelayed",
	"UpSetDelayed",
]);
const DECLARATION_OPS = new Set([
	...SET_DECLARATION_OPS,
	...SET_DELAYED_DECLARATION_OPS,
]);

const TRIVIA_KINDS = new Set([
	"Token`Whitespace",
	"Whitespace",
	"Token`Newline",
	"Newline",
	"Token`LineContinuation",
	"LineContinuation",
	"Token`Fake`ImplicitNull",
]);

const SEMICOLON_KINDS = new Set(["Token`Semi", "Token`Semicolon"]);
const SAME_DEFINITION_TARGET_HEADS = new Set(["Options", "Attributes"]);
const ATTRIBUTE_SETTER_HEADS = new Set(["SetAttributes"]);

export function nonNegativeIntegerOption(value, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.max(0, Math.floor(numeric));
}

function blankLineRangeOption(value, fallback) {
	if (value == null) return fallback;
	if (typeof value === "object" && !Array.isArray(value)) {
		const min = nonNegativeIntegerOption(value.min, fallback.min);
		const max = nonNegativeIntegerOption(value.max, fallback.max);
		return { min, max: Math.max(min, max) };
	}

	const exact = nonNegativeIntegerOption(value, fallback.min);
	return { min: exact, max: exact };
}

function exactBlankLineRange(value) {
	return { min: value, max: value };
}

function blankLinesFromRange(observedBlankLines, range) {
	const observed = nonNegativeIntegerOption(observedBlankLines, 0);
	return Math.min(range.max, Math.max(range.min, observed));
}

export function maxBlankLinesBetweenCode(options = {}) {
	options = normalizeWolframOptions(options);
	return nonNegativeIntegerOption(
		options.wolframMaxBlankLinesBetweenCode,
		DEFAULT_MAX_BLANK_LINES_BETWEEN_CODE,
	);
}

export function blankLinesBetweenDefinitions(options = {}) {
	const range = blankLineRangeBetweenDefinitions(options);
	return range.min;
}

function blankLineRangeBetweenDefinitions(options = {}) {
	options = normalizeWolframOptions(options);
	return blankLineRangeOption(
		options.wolframNewlinesBetweenDefinitions,
		exactBlankLineRange(DEFAULT_BLANK_LINES_BETWEEN_DEFINITIONS),
	);
}

function optionalBlankLineRangeOption(value, fallback) {
	if (value == null) return fallback;
	return blankLineRangeOption(value, fallback);
}

export function blankLinesBetweenSetDefinitions(options = {}) {
	const range = blankLineRangeBetweenSetDefinitions(options);
	return range.min;
}

function blankLineRangeBetweenSetDefinitions(options = {}) {
	options = normalizeWolframOptions(options);
	return optionalBlankLineRangeOption(
		options.wolframNewlinesBetweenSetDefinitions,
		blankLineRangeBetweenDefinitions(options),
	);
}

export function blankLinesBetweenSetDelayedDefinitions(options = {}) {
	const range = blankLineRangeBetweenSetDelayedDefinitions(options);
	return range.min;
}

function blankLineRangeBetweenSetDelayedDefinitions(options = {}) {
	options = normalizeWolframOptions(options);
	return optionalBlankLineRangeOption(
		options.wolframNewlinesBetweenSetDelayedDefinitions,
		blankLineRangeBetweenDefinitions(options),
	);
}

export function blankLinesBetweenSetAndSetDelayedDefinitions(options = {}) {
	const range = blankLineRangeBetweenSetAndSetDelayedDefinitions(options);
	return range.min;
}

function blankLineRangeBetweenSetAndSetDelayedDefinitions(options = {}) {
	options = normalizeWolframOptions(options);
	return optionalBlankLineRangeOption(
		options.wolframNewlinesBetweenSetAndSetDelayedDefinitions,
		blankLineRangeBetweenDefinitions(options),
	);
}

export function blankLinesBetweenSameNameDefinitions(options = {}) {
	const range = blankLineRangeBetweenSameNameDefinitions(options);
	return range.min;
}

function blankLineRangeBetweenSameNameDefinitions(options = {}) {
	options = normalizeWolframOptions(options);
	return blankLineRangeOption(
		options.wolframNewlinesBetweenSameNameDefinitions,
		exactBlankLineRange(DEFAULT_BLANK_LINES_BETWEEN_SAME_NAME_DEFINITIONS),
	);
}

function isTrivia(node) {
	return node?.type === "LeafNode" && TRIVIA_KINDS.has(node.kind);
}

function isSemicolonToken(node) {
	return node?.type === "LeafNode" && SEMICOLON_KINDS.has(node.kind);
}

function isComment(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comment";
}

function isToken(node) {
	return node?.type === "LeafNode" && node.kind?.startsWith("Token`");
}

function semanticChildren(node) {
	return (node?.children ?? []).filter(
		(child) => !isTrivia(child) && !isComment(child) && !isToken(child),
	);
}

function isSingleStatementCompound(node) {
	return (
		(node?.type === "InfixNode" && node.op === "CompoundExpression") ||
		(node?.type === "CompoundNode" &&
			(node.op === "CompoundExpression" || node.op === "Semicolon"))
	);
}

export function unwrapSingleStatementNode(node) {
	if (!isSingleStatementCompound(node)) return node;

	const statements = (node.children ?? []).filter(
		(child) =>
			!isTrivia(child) && !isSemicolonToken(child) && !isComment(child),
	);

	if (statements.length !== 1) return node;
	return unwrapSingleStatementNode(statements[0]);
}

export function isDeclarationNode(node) {
	const statement = unwrapSingleStatementNode(node);
	return (
		statement?.type === "BinaryNode" && DECLARATION_OPS.has(statement.op)
	);
}

function declarationSpacingKind(node) {
	const statement = unwrapSingleStatementNode(node);
	if (statement?.type !== "BinaryNode") return null;
	if (SET_DECLARATION_OPS.has(statement.op)) return "set";
	if (SET_DELAYED_DECLARATION_OPS.has(statement.op)) return "setDelayed";
	return null;
}

function blankLinesBetweenDeclarationKinds(
	prevKind,
	nextKind,
	options,
	{ requireSpecificOption = false } = {},
) {
	if (prevKind === "set" && nextKind === "set") {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetDefinitions == null
		) {
			return null;
		}
		return blankLinesBetweenSetDefinitions(options);
	}

	if (prevKind === "setDelayed" && nextKind === "setDelayed") {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetDelayedDefinitions == null
		) {
			return null;
		}
		return blankLinesBetweenSetDelayedDefinitions(options);
	}

	if (
		(prevKind === "set" && nextKind === "setDelayed") ||
		(prevKind === "setDelayed" && nextKind === "set")
	) {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetAndSetDelayedDefinitions == null
		) {
			return null;
		}
		return blankLinesBetweenSetAndSetDelayedDefinitions(options);
	}

	return null;
}

function blankLineRangeBetweenDeclarationKinds(
	prevKind,
	nextKind,
	options,
	{ requireSpecificOption = false } = {},
) {
	if (prevKind === "set" && nextKind === "set") {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetDefinitions == null
		) {
			return null;
		}
		return blankLineRangeBetweenSetDefinitions(options);
	}

	if (prevKind === "setDelayed" && nextKind === "setDelayed") {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetDelayedDefinitions == null
		) {
			return null;
		}
		return blankLineRangeBetweenSetDelayedDefinitions(options);
	}

	if (
		(prevKind === "set" && nextKind === "setDelayed") ||
		(prevKind === "setDelayed" && nextKind === "set")
	) {
		if (
			requireSpecificOption &&
			options.wolframNewlinesBetweenSetAndSetDelayedDefinitions == null
		) {
			return null;
		}
		return blankLineRangeBetweenSetAndSetDelayedDefinitions(options);
	}

	return null;
}

function blankLinesBetweenDeclarationNodes(
	prevNode,
	nextNode,
	options,
	requireSpecificOption = false,
) {
	return blankLinesBetweenDeclarationKinds(
		declarationSpacingKind(prevNode),
		declarationSpacingKind(nextNode),
		options,
		{ requireSpecificOption },
	);
}

function blankLineRangeBetweenDeclarationNodes(
	prevNode,
	nextNode,
	options,
	requireSpecificOption = false,
) {
	return blankLineRangeBetweenDeclarationKinds(
		declarationSpacingKind(prevNode),
		declarationSpacingKind(nextNode),
		options,
		{ requireSpecificOption },
	);
}

function firstSemanticChild(node) {
	return semanticChildren(node)[0] ?? null;
}

function symbolName(node) {
	if (node?.type === "LeafNode" && node.kind === "Symbol") {
		return String(node.value ?? "");
	}

	return null;
}

function callHeadName(node) {
	return symbolName(node?.head);
}

function callArgumentNodes(node) {
	if (node?.type !== "CallNode") return [];

	const commaWrapper = (node.children ?? []).find(
		(child) => child.type === "InfixNode" && child.op === "Comma",
	);
	if (commaWrapper) {
		return semanticChildren(commaWrapper);
	}

	return semanticChildren(node);
}

function subjectNamesFromExpression(node) {
	const name = symbolName(node);
	if (name) return new Set([name]);

	if (
		node?.type === "GroupNode" ||
		node?.type === "InfixNode" ||
		node?.type === "CompoundNode"
	) {
		const names = new Set();
		for (const child of semanticChildren(node)) {
			for (const childName of subjectNamesFromExpression(child)) {
				names.add(childName);
			}
		}
		return names;
	}

	return new Set();
}

function definitionTargetNamesFromCall(node, allowedHeads) {
	if (node?.type !== "CallNode" || !allowedHeads.has(callHeadName(node))) {
		return new Set();
	}

	return subjectNamesFromExpression(callArgumentNodes(node)[0]);
}

function definitionTargetNamesFromShorthand(node, allowedHeads) {
	if (node?.type !== "BinaryNode") return new Set();

	const [lhs, rhs] = semanticChildren(node);
	if (node.op === "BinaryAt" && allowedHeads.has(symbolName(lhs))) {
		return subjectNamesFromExpression(rhs);
	}

	if (node.op === "BinarySlashSlash" && allowedHeads.has(symbolName(rhs))) {
		return subjectNamesFromExpression(lhs);
	}

	return new Set();
}

function definitionTargetNames(node, allowedHeads) {
	const callNames = definitionTargetNamesFromCall(node, allowedHeads);
	if (callNames.size > 0) return callNames;

	return definitionTargetNamesFromShorthand(node, allowedHeads);
}

function functionNameFromCallHead(node) {
	const name = symbolName(node);
	if (name) return name;

	if (node?.type === "CallNode") {
		return functionNameFromCallHead(node.head);
	}

	if (node?.type === "BinaryNode" || node?.type === "CompoundNode") {
		return functionNameFromCallHead(firstSemanticChild(node));
	}

	return null;
}

function functionDefinitionSubjectNamesFromLhs(
	node,
	{ allowBareSymbol = false } = {},
) {
	const bareName = symbolName(node);
	if (allowBareSymbol && bareName) return new Set([bareName]);

	if (node?.type === "InfixNode" && node.op === "MessageName") {
		return subjectNamesFromExpression(firstSemanticChild(node));
	}

	const targetNames = definitionTargetNames(
		node,
		SAME_DEFINITION_TARGET_HEADS,
	);
	if (targetNames.size > 0) return targetNames;

	if (node?.type === "BinaryNode") {
		const [lhs, rhs] = semanticChildren(node);
		if (node.op === "BinaryAt") {
			const name = functionNameFromCallHead(lhs);
			return name ? new Set([name]) : new Set();
		}

		if (node.op === "BinarySlashSlash") {
			const name = functionNameFromCallHead(rhs);
			return name ? new Set([name]) : new Set();
		}
	}

	if (node?.type === "CallNode") {
		const name = functionNameFromCallHead(node.head);
		return name ? new Set([name]) : new Set();
	}

	if (node?.type === "BinaryNode" || node?.type === "CompoundNode") {
		return functionDefinitionSubjectNamesFromLhs(firstSemanticChild(node), {
			allowBareSymbol,
		});
	}

	return new Set();
}

function binaryLhs(node) {
	return firstSemanticChild(node);
}

function definitionSubjectNames(node) {
	const statement = unwrapSingleStatementNode(node);
	const attributeNames = definitionTargetNames(
		statement,
		ATTRIBUTE_SETTER_HEADS,
	);
	if (attributeNames.size > 0) return attributeNames;

	if (
		statement?.type !== "BinaryNode" ||
		!DECLARATION_OPS.has(statement.op)
	) {
		return new Set();
	}

	return functionDefinitionSubjectNamesFromLhs(binaryLhs(statement), {
		allowBareSymbol: ["TagSet", "TagSetDelayed"].includes(statement.op),
	});
}

function hasSharedDefinitionSubject(prevNode, nextNode) {
	const prevNames = definitionSubjectNames(prevNode);
	if (prevNames.size === 0) return false;

	const nextNames = definitionSubjectNames(nextNode);
	for (const name of prevNames) {
		if (nextNames.has(name)) return true;
	}

	return false;
}

export function observedBlankLinesBetween(prevEndLine, nextStartLine) {
	if (!Number.isFinite(prevEndLine) || !Number.isFinite(nextStartLine)) {
		return 0;
	}

	return Math.max(0, nextStartLine - prevEndLine - 1);
}

export function blankLineRangeForCodeGap(
	prevNode,
	nextNode,
	options = {},
	{ topLevel = false } = {},
) {
	options = normalizeWolframOptions(options);
	const mode = options.wolframTopLevelSpacingMode ?? "declarations";
	if (topLevel && mode === "none") return exactBlankLineRange(0);

	if (hasSharedDefinitionSubject(prevNode, nextNode)) {
		return blankLineRangeBetweenSameNameDefinitions(options);
	}

	if (isDeclarationNode(prevNode) && isDeclarationNode(nextNode)) {
		return (
			blankLineRangeBetweenDeclarationNodes(
				prevNode,
				nextNode,
				options,
			) ?? blankLineRangeBetweenDefinitions(options)
		);
	}

	const maxBlankLines = maxBlankLinesBetweenCode(options);
	if (topLevel && mode === "all") {
		return { min: Math.min(1, maxBlankLines), max: maxBlankLines };
	}

	return { min: 0, max: maxBlankLines };
}

export function blankLinesForCodeGap(
	prevNode,
	nextNode,
	observedBlankLines,
	options = {},
	{ topLevel = false } = {},
) {
	return blankLinesFromRange(
		observedBlankLines,
		blankLineRangeForCodeGap(prevNode, nextNode, options, { topLevel }),
	);
}

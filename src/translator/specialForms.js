// src/translator/specialForms.js
import { doc } from "prettier";
const { builders } = doc;
import {
	isTrivia,
	singleLineStringLiteralRunDoc,
	stringLineIndentDepth,
	stringLiteralRunDocs,
} from "./nodes/leaf.js";
import {
	argPathEntries,
	hasDirectCommentArg,
	printCall,
	printedArgs,
} from "./nodes/call.js";
import { normalizeWolframOptions } from "../options.js";
const { conditionalGroup, group, indent, hardline, line, softline, join } =
	builders;
const { willBreak } = doc.utils;

const DEFAULT_CONDITION_FIRST_FUNCTIONS = "If,Switch";
const DEFAULT_BLOCK_STRUCTURE_FUNCTIONS = "Module,With,Block,DynamicModule";
const DEFAULT_CASE_STRUCTURE_FUNCTIONS = "Which";

const PATTERN_BLANK_OPS = new Set([
	"PatternBlank",
	"PatternBlankSequence",
	"PatternBlankNullSequence",
]);

const BLANK_OPS = new Set(["Blank", "BlankSequence", "BlankNullSequence"]);

// Build Sets from comma-separated option strings
export function buildDispatchSets(options = {}) {
	options = normalizeWolframOptions(options);
	const toOptionString = (name, fallback) => {
		const value = options[name];
		return value == null ? fallback : String(value);
	};
	const toSet = (str) =>
		new Set(
			str
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
		);
	return {
		conditionFirst: toSet(
			toOptionString(
				"wolframConditionFirstFunctions",
				DEFAULT_CONDITION_FIRST_FUNCTIONS,
			),
		),
		blockStructure: toSet(
			toOptionString(
				"wolframBlockStructureFunctions",
				DEFAULT_BLOCK_STRUCTURE_FUNCTIONS,
			),
		),
		caseStructure: toSet(
			toOptionString(
				"wolframCaseStructureFunctions",
				DEFAULT_CASE_STRUCTURE_FUNCTIONS,
			),
		),
	};
}

function getHeadName(node) {
	if (node.head?.type === "LeafNode" && node.head.kind === "Symbol") {
		return node.head.value;
	}
	return null;
}

function containsComment(node) {
	if (!node) return false;
	if (node.type === "LeafNode" && node.kind === "Token`Comment") return true;
	return (node.children ?? []).some((child) => containsComment(child));
}

function isStringJoinCall(node) {
	return node?.type === "CallNode" && getHeadName(node) === "StringJoin";
}

function isStringJoinInfix(node) {
	return node?.type === "InfixNode" && node.op === "StringJoin";
}

function isStringJoinForm(node) {
	return isStringJoinCall(node) || isStringJoinInfix(node);
}

function isCommaToken(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comma";
}

function isCommentNode(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comment";
}

function isStringJoinOperatorToken(node) {
	return node?.type === "LeafNode" && node.kind === "Token`LessGreater";
}

function stringJoinPathEntries(node) {
	if (isStringJoinCall(node)) return argPathEntries(node);

	return (node.children ?? []).reduce((entries, child, index) => {
		if (isTrivia(child) || isStringJoinOperatorToken(child)) return entries;
		entries.push({ node: child, path: ["children", index] });
		return entries;
	}, []);
}

function hasFollowingCommaSibling(path) {
	let child = path?.getValue?.();

	for (const ancestor of path?.ancestors ?? []) {
		if (ancestor?.type === "InfixNode" && ancestor.op === "Comma") {
			const index = ancestor.children?.indexOf(child) ?? -1;
			if (index !== -1) {
				return ancestor.children
					.slice(index + 1)
					.some((node) => !isTrivia(node) && !isCommaToken(node));
			}
		}
		child = ancestor;
	}

	return false;
}

function flattenStringJoinParts(path, print, node, basePath = []) {
	const parts = [];

	for (const entry of stringJoinPathEntries(node)) {
		if (
			entry.node?.type === "LeafNode" &&
			entry.node.kind === "Token`Comma"
		) {
			continue;
		}

		const entryPath = [...basePath, ...entry.path];
		if (isStringJoinForm(entry.node)) {
			parts.push(
				...flattenStringJoinParts(path, print, entry.node, entryPath),
			);
			continue;
		}

		if (entry.node?.type === "LeafNode" && entry.node.kind === "String") {
			parts.push({ type: "string", node: entry.node });
			continue;
		}

		parts.push({ type: "doc", doc: path.call(print, ...entryPath) });
	}

	return parts;
}

function stringJoinPartDocs(parts, options, indentDepth) {
	const docs = [];
	let stringRun = [];

	function flushStrings() {
		if (stringRun.length === 0) return;
		docs.push(
			...stringLiteralRunDocs(stringRun, options, {
				indentDepth,
				mode: "stringJoinArg",
			}),
		);
		stringRun = [];
	}

	for (const part of parts) {
		if (part.type === "string") {
			stringRun.push(part.node);
			continue;
		}

		flushStrings();
		docs.push(part.doc);
	}

	flushStrings();
	return docs;
}

function printStringJoin(path, options, print, node) {
	if (containsComment(node)) return printCall(path, options, print, node);

	const head = isStringJoinCall(node) ? path.call(print, "head") : "StringJoin";
	const parts = flattenStringJoinParts(path, print, node);
	const indentDepth = stringLineIndentDepth(path);
	const allStringNodes = parts.every((part) => part.type === "string")
		? parts.map((part) => part.node)
		: null;
	const singleLineLiteral = allStringNodes
		? singleLineStringLiteralRunDoc(allStringNodes, options, {
				indentDepth,
				widthOffset: hasFollowingCommaSibling(path) ? 1 : 0,
			})
		: null;
	if (singleLineLiteral) return singleLineLiteral;

	const argDocs = stringJoinPartDocs(
		parts,
		options,
		indentDepth,
	);
	if (argDocs.length === 0) return [head, "[]"];

	return group([
		head,
		"[",
		indent([line, join([",", line], argDocs)]),
		softline,
		"]",
	]);
}

// If[cond, then, else] — keep the condition beside If[ only when it fits.
function printConditionFirst(path, options, print, node) {
	if (hasDirectCommentArg(node)) return printCall(path, options, print, node);

	const head = path.call(print, "head");
	const args = printedArgs(path, options, print, node);
	if (args.length === 0) return [head, "[]"];

	const [cond, ...rest] = args;

	if (rest.length === 0) {
		return group([head, "[", indent([softline, cond]), softline, "]"]);
	}

	const brokenWithHeadCondition = [
		head,
		"[",
		cond,
		",",
		indent(
			rest.flatMap((r, i) => [
				hardline,
				r,
				i < rest.length - 1 ? "," : "",
			]),
		),
		hardline,
		"]",
	];
	const fullyBroken = [
		head,
		"[",
		indent([
			hardline,
			cond,
			",",
			...rest.flatMap((r, i) => [
				hardline,
				r,
				i < rest.length - 1 ? "," : "",
			]),
		]),
		hardline,
		"]",
	];

	if (args.some((arg) => willBreak(arg))) {
		return brokenWithHeadCondition;
	}

	return conditionalGroup([
		[head, "[", join([", "], [cond, ...rest]), "]"],
		brokenWithHeadCondition,
		fullyBroken,
	]);
}

function buildCasePairs(args) {
	const pairs = [];
	for (let i = 0; i + 1 < args.length; i += 2) {
		pairs.push([args[i], args[i + 1]]);
	}

	return {
		pairs,
		trailing: args.length % 2 === 1 ? args[args.length - 1] : null,
	};
}

function casePairDocs(pairs, { forceBreak = false } = {}) {
	const pairLine = forceBreak ? hardline : line;
	return pairs.map(([cond, val]) => [cond, ",", indent([pairLine, val])]);
}

// Module[{vars}, body] — var list breaks per-var when long or when printWidth requires it.
function printBlockStructure(path, options, print, node) {
	if (hasDirectCommentArg(node)) return printCall(path, options, print, node);

	const head = path.call(print, "head");
	const args = printedArgs(path, options, print, node);
	if (args.length === 0) return [head, "[]"];

	// We still need the raw node for the first arg to inspect its structure
	const { argChildren } = _getArgNodesAndPrinted(path, options, print, node);

	const varListNode = argChildren[0];
	if (!varListNode || containsComment(varListNode))
		return printCall(path, options, print, node);

	const body = args.slice(1);
	const varListDoc = formatVarListPath(
		path,
		options,
		print,
		node,
		varListNode,
	);

	if (body.length === 0) {
		return group([head, "[", varListDoc, "]"]);
	}

	return group([
		head,
		"[",
		varListDoc,
		",",
		indent([line, join([",", line], body)]),
		softline,
		"]",
	]);
}

function printSwitchStructure(path, options, print, node) {
	if (hasDirectCommentArg(node)) return printCall(path, options, print, node);

	const head = path.call(print, "head");
	const args = printedArgs(path, options, print, node);
	if (args.length === 0) return [head, "[]"];

	const [expr, ...rest] = args;
	if (rest.length === 0) {
		return group([head, "[", indent([softline, expr]), softline, "]"]);
	}

	const { pairs, trailing } = buildCasePairs(rest);
	const pairDocs = casePairDocs(pairs, { forceBreak: true });
	const brokenTail = [
		join([",", hardline], pairDocs),
		trailing ? [",", hardline, trailing] : "",
	];

	const brokenSwitch = [
		head,
		"[",
		expr,
		",",
		indent([hardline, ...brokenTail]),
		hardline,
		"]",
	];

	if (args.some((arg) => willBreak(arg))) {
		return brokenSwitch;
	}

	return conditionalGroup([
		[head, "[", join([", "], args), "]"],
		brokenSwitch,
	]);
}

/** Helper: returns both the raw arg nodes and their printed forms. */
function _getArgNodesAndPrinted(path, options, print, node) {
	// Determine whether there's an InfixNode[Comma] wrapper
	const wrapperIdx = node.children.findIndex(
		(c) => c.type === "InfixNode" && c.op === "Comma",
	);
	let rawArgs;
	if (wrapperIdx !== -1) {
		const wrapper = node.children[wrapperIdx];
		rawArgs = wrapper.children.filter((c) => {
			if (
				c.type === "LeafNode" &&
				(c.kind === "Token`Comma" ||
					c.kind === "Token`Whitespace" ||
					c.kind === "Whitespace")
			)
				return false;
			return true;
		});
	} else {
		rawArgs = node.children.filter((c) => {
			if (
				c.type === "LeafNode" &&
				(c.kind === "Token`OpenSquare" ||
					c.kind === "Token`CloseSquare" ||
					c.kind === "Token`Comma" ||
					c.kind === "Token`Whitespace" ||
					c.kind === "Whitespace")
			)
				return false;
			return true;
		});
	}
	const printed = printedArgs(path, options, print, node);
	return { argChildren: rawArgs, printed };
}

function semanticArgsGroup(node) {
	return (node.children ?? []).filter(
		(c) =>
			!isTrivia(c) &&
			!(
				c.type === "LeafNode" &&
				(c.kind === "Token`OpenCurly" ||
					c.kind === "Token`CloseCurly" ||
					c.kind === "Token`LessBar" ||
					c.kind === "Token`BarGreater" ||
					c.kind === "Token`Comma")
			),
	);
}

function semanticGroupEntries(callNode, groupNode) {
	const wrapperIdx = callNode.children.findIndex(
		(c) => c.type === "InfixNode" && c.op === "Comma",
	);
	const basePath = [];

	if (wrapperIdx !== -1) {
		const wrapper = callNode.children[wrapperIdx];
		const groupIdx = wrapper.children.indexOf(groupNode);
		if (groupIdx === -1) return [];
		basePath.push("children", wrapperIdx, "children", groupIdx);
	} else {
		const groupIdx = callNode.children.indexOf(groupNode);
		if (groupIdx === -1) return [];
		basePath.push("children", groupIdx);
	}

	const semanticChildren = (groupNode.children ?? []).filter(
		(child) =>
			!isTrivia(child) &&
			!(
				child.type === "LeafNode" &&
				(child.kind === "Token`OpenCurly" ||
					child.kind === "Token`CloseCurly" ||
					child.kind === "Token`LessBar" ||
					child.kind === "Token`BarGreater")
			),
	);

	if (
		semanticChildren.length === 1 &&
		semanticChildren[0].type === "InfixNode" &&
		semanticChildren[0].op === "Comma"
	) {
		const commaWrapperIdx = groupNode.children.indexOf(semanticChildren[0]);
		return semanticChildren[0].children.reduce((entries, child, idx) => {
			if (isTrivia(child) || isCommentNode(child)) return entries;
			if (child.type === "LeafNode" && child.kind === "Token`Comma")
				return entries;
			entries.push({
				node: child,
				path: [
					...basePath,
					"children",
					commaWrapperIdx,
					"children",
					idx,
				],
			});
			return entries;
		}, []);
	}

	return (groupNode.children ?? []).reduce((entries, child, idx) => {
		if (isTrivia(child) || isCommentNode(child)) return entries;
		if (
			child.type === "LeafNode" &&
			(child.kind === "Token`OpenCurly" ||
				child.kind === "Token`CloseCurly" ||
				child.kind === "Token`LessBar" ||
				child.kind === "Token`BarGreater" ||
				child.kind === "Token`Comma")
		) {
			return entries;
		}
		entries.push({ node: child, path: [...basePath, "children", idx] });
		return entries;
	}, []);
}

function inlineNodeText(node) {
	if (!node) return "";
	if (node.type === "LeafNode") return String(node.value ?? "");
	if (node.type === "CompoundNode" && PATTERN_BLANK_OPS.has(node.op)) {
		return (node.children ?? []).map(inlineNodeText).join("");
	}
	if (node.type === "CompoundNode" && BLANK_OPS.has(node.op)) {
		return (node.children ?? []).map(inlineNodeText).join("");
	}
	if (
		node.type === "CompoundNode" &&
		(node.op === "Slot" || node.op === "SlotSequence")
	) {
		return (node.children ?? []).map(inlineNodeText).join("");
	}
	if (
		node.type === "BinaryNode" &&
		(node.op === "Set" || node.op === "SetDelayed")
	) {
		const semantic = (node.children ?? []).filter(
			(c) =>
				!isTrivia(c) &&
				!(
					c.type === "LeafNode" &&
					c.kind.startsWith("Token`") &&
					!["Token`Hash", "Token`HashHash"].includes(c.kind)
				),
		);
		const op = node.op === "Set" ? "=" : ":=";
		if (semantic.length === 2)
			return `${inlineNodeText(semantic[0])} ${op} ${inlineNodeText(semantic[1])}`;
	}
	if (node.type === "BinaryNode") {
		const semantic = (node.children ?? []).filter(
			(c) =>
				!isTrivia(c) &&
				!(
					c.type === "LeafNode" &&
					c.kind.startsWith("Token`") &&
					!["Token`Hash", "Token`HashHash"].includes(c.kind)
				),
		);
		const opMap = {
			Power: "^",
			Divide: "/",
			ReplaceAll: "/.",
			Rule: "->",
			RuleDelayed: ":>",
			Condition: "/;",
		};
		const op = opMap[node.op] ?? node.op;
		if (semantic.length === 2)
			return `${inlineNodeText(semantic[0])} ${op} ${inlineNodeText(semantic[1])}`;
	}
	if (node.type === "InfixNode") {
		const semantic = (node.children ?? []).filter(
			(c) =>
				!isTrivia(c) &&
				!(c.type === "LeafNode" && c.kind === "Token`Comma"),
		);
		if (node.op === "Comma") return semantic.map(inlineNodeText).join(", ");
		if (node.op === "Plus") return semantic.map(inlineNodeText).join(" + ");
		if (node.op === "Times")
			return semantic.map(inlineNodeText).join(" * ");
		if (node.op === "InfixInequality" && semantic.length === 3)
			return `${inlineNodeText(semantic[0])} ${inlineNodeText(node.children[1])} ${inlineNodeText(semantic[2])}`;
		if (node.op === "CompoundExpression")
			return semantic.map(inlineNodeText).join("; ");
	}
	if (node.type === "CallNode") {
		const head = inlineNodeText(node.head);
		const args = (node.children ?? []).filter(
			(c) =>
				!isTrivia(c) &&
				!(
					c.type === "LeafNode" &&
					(c.kind === "Token`OpenSquare" ||
						c.kind === "Token`CloseSquare")
				),
		);
		if (
			args.length === 1 &&
			args[0].type === "InfixNode" &&
			args[0].op === "Comma"
		) {
			return `${head}[${inlineNodeText(args[0])}]`;
		}
		return `${head}[${args.map(inlineNodeText).join(", ")}]`;
	}
	if (node.type === "GroupNode" && node.kind === "List") {
		return `{${semanticArgsGroup(node).map(inlineNodeText).join(", ")}}`;
	}
	if (node.type === "GroupNode" && node.kind === "Association") {
		return `<|${semanticArgsGroup(node).map(inlineNodeText).join(", ")}|>`;
	}
	return String(node.value ?? "");
}

function moduleVarsBreakThreshold(options) {
	options = normalizeWolframOptions(options);
	const threshold = Number(options.wolframModuleVarsBreakThreshold ?? 40);
	if (!Number.isFinite(threshold)) return 40;
	return Math.max(0, threshold);
}

function formatVarListPath(path, options, print, callNode, varListNode) {
	if (varListNode.type !== "GroupNode") {
		const printed = printedArgs(path, options, print, callNode);
		return printed[0] ?? "{}";
	}

	const entries = semanticGroupEntries(callNode, varListNode);
	if (entries.length === 0) return "{}";

	const inline = `{${entries.map((entry) => inlineNodeText(entry.node)).join(", ")}}`;
	const shouldBreak = inline.length > moduleVarsBreakThreshold(options);
	const entryDocs = entries.map((entry) => path.call(print, ...entry.path));

	return group(
		indent([
			"{",
			indent([softline, join([",", line], entryDocs)]),
			softline,
			"}",
		]),
		{ shouldBreak },
	);
}

// Which[cond1, val1, cond2, val2] — alternating 1/2 indent levels
function printCaseStructure(path, options, print, node) {
	if (hasDirectCommentArg(node)) return printCall(path, options, print, node);

	const head = path.call(print, "head");
	const args = printedArgs(path, options, print, node);
	if (args.length === 0) return [head, "[]"];

	const { pairs, trailing } = buildCasePairs(args);
	const pairDocs = casePairDocs(pairs);

	return group([
		head,
		"[",
		indent([
			line,
			join([",", line], pairDocs),
			trailing ? [",", line, trailing] : "",
		]),
		softline,
		"]",
	]);
}

/** Returns the specialized printer for a supported node, or null if none applies. */
export function getSpecialPrinter(node, options) {
	if (isStringJoinInfix(node)) {
		return containsComment(node) ? null : printStringJoin;
	}

	const name = getHeadName(node);
	if (!name) return null;
	if (name === "StringJoin") return printStringJoin;
	const sets = buildDispatchSets(options);
	if (name === "Switch" && sets.conditionFirst.has(name))
		return printSwitchStructure;
	if (sets.conditionFirst.has(name)) return printConditionFirst;
	if (sets.blockStructure.has(name)) return printBlockStructure;
	if (sets.caseStructure.has(name)) return printCaseStructure;
	return null;
}

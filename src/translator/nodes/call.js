// src/translator/nodes/call.js
import { doc } from "prettier";
const { builders } = doc;
import { isComment, isTrivia } from "./leaf.js";
import { alignedRuleDoc, withAlignedRuleValues } from "../ruleAlignment.js";
const { group, indent, softline, line } = builders;

const BRACKET_KINDS = new Set(["Token`OpenSquare", "Token`CloseSquare"]);

function isBracketToken(node) {
	return node.type === "LeafNode" && BRACKET_KINDS.has(node.kind);
}

function isCommaToken(node) {
	return node.type === "LeafNode" && node.kind === "Token`Comma";
}

/** Find index of the InfixNode[Comma] wrapper in node.children, or -1. */
function commaWrapperIndex(node) {
	return node.children.findIndex(
		(c) => c.type === "InfixNode" && c.op === "Comma",
	);
}

function rawArgEntries(node) {
	const wrapperIdx = commaWrapperIndex(node);

	return node.children.reduce((entries, child, idx) => {
		if (isTrivia(child) || isBracketToken(child)) return entries;

		if (idx === wrapperIdx) {
			child.children.forEach((wrappedChild, wrappedIdx) => {
				if (isTrivia(wrappedChild)) return;
				entries.push({
					node: wrappedChild,
					path: ["children", idx, "children", wrappedIdx],
				});
			});
			return entries;
		}

		entries.push({
			node: child,
			path: ["children", idx],
		});
		return entries;
	}, []);
}

export function argPathEntries(node) {
	return rawArgEntries(node);
}

export function hasDirectCommentArg(node) {
	return argPathEntries(node).some((entry) => isComment(entry.node));
}

export function printedArgEntries(path, options, print, node) {
	return argPathEntries(node).map((entry) => ({
		node: entry.node,
		doc: path.call(print, ...entry.path),
		path: entry.path,
	}));
}

/** Extract semantic argument nodes from a CallNode, and return them along
 *  with a path-aware print function for each.
 *
 *  path/print are prettier primitives so we can descend correctly into nested
 *  nodes (avoiding indexOf returning -1 for nodes that aren't direct children).
 */
export function printedArgs(path, options, print, node) {
	return printedArgEntries(path, options, print, node)
		.filter((entry) => !isCommaToken(entry.node))
		.map((entry) => entry.doc);
}

export function printCall(path, options, print, node) {
	const head = path.call(print, "head");
	const entries = withAlignedRuleValues(
		printedArgEntries(path, options, print, node),
		path,
		options,
		print,
	);
	const args = entries.filter((entry) => !isCommaToken(entry.node));

	if (args.length === 0) return [head, "[]"];

	const docs = [];
	const commaGap = options.wolframSpaceAfterComma ? line : softline;
	const alignmentGroupId = entries.some((entry) => entry.alignedRuleDoc)
		? Symbol("wolfram-align-rule-values")
		: null;
	let previousKind = null;

	for (const entry of entries) {
		if (isCommaToken(entry.node)) {
			if (previousKind === null || previousKind === "comma") continue;
			docs.push(",", commaGap);
			previousKind = "comma";
			continue;
		}

		if (previousKind !== null && previousKind !== "comma") {
			docs.push(line);
		}

		docs.push(alignedRuleDoc(entry, alignmentGroupId));
		previousKind = isComment(entry.node) ? "comment" : "arg";
	}

	const contents = [head, "[", indent([softline, ...docs]), softline, "]"];

	return alignmentGroupId
		? group(contents, { id: alignmentGroupId })
		: group(contents);
}

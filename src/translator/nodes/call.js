// src/translator/nodes/call.js
import { doc } from "prettier";
const { builders } = doc;
import { isComment, isTrivia } from "./leaf.js";
import { alignedRuleDoc, withAlignedRuleValues } from "../ruleAlignment.js";
import { sourceLineGap } from "../sourceLines.js";
import { normalizeWolframOptions } from "../../options.js";
const { group, indent, softline, line, hardline } = builders;

const BRACKET_KINDS = new Set(["Token`OpenSquare", "Token`CloseSquare"]);

function isBracketToken(node) {
	return node.type === "LeafNode" && BRACKET_KINDS.has(node.kind);
}

function isCommaToken(node) {
	return node.type === "LeafNode" && node.kind === "Token`Comma";
}

function nextContentEntry(entries, startIndex) {
	for (let i = startIndex + 1; i < entries.length; i++) {
		if (!isCommaToken(entries[i].node)) return entries[i];
	}
	return null;
}

function previousContentEntry(entries, startIndex) {
	for (let i = startIndex - 1; i >= 0; i--) {
		if (!isCommaToken(entries[i].node)) return entries[i];
	}
	return null;
}

function hasCommentBoundary(leftEntry, rightEntry) {
	return isComment(leftEntry?.node) || isComment(rightEntry?.node);
}

function commentBoundary(leftEntry, rightEntry, options, fallback = line) {
	if (!leftEntry || !rightEntry) return fallback;
	const gap = sourceLineGap(leftEntry.node, rightEntry.node, options);
	if (gap === 0) return " ";
	if (gap > 0) return hardline;
	return fallback;
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

function partGroupEntry(node) {
	const entries = rawArgEntries(node).filter(
		(entry) => !isCommaToken(entry.node),
	);
	if (entries.length !== 1) return null;
	const [entry] = entries;
	return entry.node.type === "GroupNode" && entry.node.kind === "GroupSquare"
		? entry
		: null;
}

function groupPathEntries(groupNode, groupPath) {
	const contents = groupNode.children.filter(
		(child) => !isTrivia(child) && !isBracketToken(child),
	);

	if (
		contents.length === 1 &&
		contents[0].type === "InfixNode" &&
		contents[0].op === "Comma"
	) {
		const wrapperIdx = groupNode.children.indexOf(contents[0]);
		return contents[0].children.reduce((entries, child, idx) => {
			if (isTrivia(child)) return entries;
			entries.push({
				node: child,
				path: [...groupPath, "children", wrapperIdx, "children", idx],
			});
			return entries;
		}, []);
	}

	return groupNode.children.reduce((entries, child, idx) => {
		if (isTrivia(child) || isBracketToken(child)) return entries;
		entries.push({
			node: child,
			path: [...groupPath, "children", idx],
		});
		return entries;
	}, []);
}

function printedEntries(path, print, entries) {
	return entries.map((entry) => ({
		node: entry.node,
		doc: path.call(print, ...entry.path),
		path: entry.path,
	}));
}

function sequenceDocs(entries, options, itemKind) {
	const docs = [];
	const commaGap = options.wolframSpaceAfterComma ? line : softline;
	const alignmentGroupId = entries.some((entry) => entry.alignedRuleDoc)
		? Symbol("wolfram-align-rule-values")
		: null;
	let previousKind = null;

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (isCommaToken(entry.node)) {
			if (previousKind === null || previousKind === "comma") continue;
			const previousEntry = previousContentEntry(entries, i);
			const followingEntry = nextContentEntry(entries, i);
			const separator =
				followingEntry &&
				hasCommentBoundary(previousEntry, followingEntry)
					? commentBoundary(
							previousEntry,
							followingEntry,
							options,
							commaGap,
						)
					: commaGap;
			docs.push(",", separator);
			previousKind = "comma";
			continue;
		}

		if (previousKind !== null && previousKind !== "comma") {
			const previousEntry = previousContentEntry(entries, i);
			docs.push(
				hasCommentBoundary(previousEntry, entry)
					? commentBoundary(previousEntry, entry, options, line)
					: line,
			);
		}

		docs.push(alignedRuleDoc(entry, alignmentGroupId));
		previousKind = isComment(entry.node) ? "comment" : itemKind;
	}

	return { docs, alignmentGroupId };
}

function grouped(contents, alignmentGroupId) {
	return alignmentGroupId
		? group(contents, { id: alignmentGroupId })
		: group(contents);
}

function printPartCall(path, options, print, node, head) {
	const partEntry = partGroupEntry(node);
	if (!partEntry) return null;

	const entries = withAlignedRuleValues(
		printedEntries(
			path,
			print,
			groupPathEntries(partEntry.node, partEntry.path),
		),
		path,
		options,
		print,
	);
	const args = entries.filter((entry) => !isCommaToken(entry.node));

	if (args.length === 0) return [head, "[[]]"];

	const { docs, alignmentGroupId } = sequenceDocs(entries, options, "part");
	return grouped(
		[head, "[[", indent([softline, ...docs]), softline, "]]"],
		alignmentGroupId,
	);
}

export function printCall(path, options, print, node) {
	options = normalizeWolframOptions(options);
	const head = path.call(print, "head");
	const partCall = printPartCall(path, options, print, node, head);
	if (partCall) return partCall;

	const entries = withAlignedRuleValues(
		printedArgEntries(path, options, print, node),
		path,
		options,
		print,
	);
	const args = entries.filter((entry) => !isCommaToken(entry.node));

	if (args.length === 0) return [head, "[]"];

	const { docs, alignmentGroupId } = sequenceDocs(entries, options, "arg");
	const contents = [head, "[", indent([softline, ...docs]), softline, "]"];

	return grouped(contents, alignmentGroupId);
}

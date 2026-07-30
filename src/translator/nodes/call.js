// src/translator/nodes/call.js
import { doc } from "prettier";
const { builders } = doc;
import { isComment, isTrivia, stringLineIndentDepth } from "./leaf.js";
import { alignedRuleDoc, withAlignedRuleValues } from "../ruleAlignment.js";
import { commentBoundarySeparator } from "../commentSpacing.js";
import {
	documentationCommentColumn,
	withAlignedTrailingComment,
	withMarkedTrailingCommentDocs,
} from "../docComments.js";
import { normalizeWolframOptions } from "../../options.js";
import { buildDispatchSets } from "../specialForms.js";
const { group, indent, softline, line, hardline } = builders;

const BRACKET_KINDS = new Set(["Token`OpenSquare", "Token`CloseSquare"]);

function isBracketToken(node) {
	return node.type === "LeafNode" && BRACKET_KINDS.has(node.kind);
}

function isCommaToken(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comma";
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

function callHeadName(node) {
	return node.head?.type === "LeafNode" && node.head.kind === "Symbol"
		? node.head.value
		: null;
}

function shouldBreakCommentedSpecialCall(node, options, entries) {
	if (!entries.some((entry) => isComment(entry.node))) return false;
	const name = callHeadName(node);
	if (!name) return false;
	const sets = buildDispatchSets(options);
	return (
		sets.conditionFirst.has(name) ||
		sets.blockStructure.has(name) ||
		sets.caseStructure.has(name)
	);
}

function commentBoundary(leftEntry, rightEntry, options, fallback = line) {
	if (!leftEntry || !rightEntry) return fallback;
	return commentBoundarySeparator(
		leftEntry.node,
		rightEntry.node,
		options,
		fallback,
	);
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
	// Flatten the comma-separated wrapper wherever it sits so its elements become
	// individual entries even when a sibling comment keeps it from being the sole
	// content of the group (mirrors rawArgEntries).
	const wrapperIdx = groupNode.children.findIndex(
		(child) => child.type === "InfixNode" && child.op === "Comma",
	);

	return groupNode.children.reduce((entries, child, idx) => {
		if (isTrivia(child) || isBracketToken(child)) return entries;

		if (idx === wrapperIdx) {
			child.children.forEach((wrappedChild, wrappedIdx) => {
				if (isTrivia(wrappedChild)) return;
				entries.push({
					node: wrappedChild,
					path: [...groupPath, "children", idx, "children", wrappedIdx],
				});
			});
			return entries;
		}

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

function sequenceDocs(rawEntries, options, itemKind, columnOffset = 0) {
	const entries = withMarkedTrailingCommentDocs(rawEntries, options);
	const docs = [];
	const commaGap = options.wolframSpaceAfterComma ? line : softline;
	const alignmentGroupId = entries.some((entry) => entry.alignedRuleDoc)
		? Symbol("wolfram-align-rule-values")
		: null;
	for (let i = 0; i < entries.length; i++) {
		if (entries[i].trailingCommentDoc) {
			entries[i].trailingCommentSuffix = trailingCommentSuffix(
				entries,
				i,
			);
		}
	}
	const trailingCommentEntries = entries.filter(
		(entry) => entry.trailingCommentDoc,
	);
	const trailingCommentColumn =
		trailingCommentEntries.length > 0
			? documentationCommentColumn(
					trailingCommentEntries,
					options,
					(entry) => entry.trailingCommentSuffix ?? "",
					columnOffset,
				)
			: null;
	let previousKind = null;

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (isCommaToken(entry.node)) {
			const previousEntry = previousContentEntry(entries, i);
			if (
				previousEntry?.trailingCommentDoc &&
				previousEntry.trailingCommentSuffix === ","
			) {
				previousKind = "comma";
				continue;
			}

			if (previousKind === null || previousKind === "comma") continue;
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

		const entryDoc = alignedRuleDoc(entry, alignmentGroupId);
		if (entry.trailingCommentDoc) {
			docs.push(
				withAlignedTrailingComment(
					{ ...entry, doc: entryDoc },
					options,
					trailingCommentColumn,
					entry.trailingCommentSuffix ?? "",
				),
			);
			if (
				entry.trailingCommentSuffix === "," &&
				nextContentEntry(entries, i)
			) {
				docs.push(hardline);
				previousKind = "comma";
				continue;
			}
		} else {
			docs.push(entryDoc);
		}
		previousKind = isComment(entry.node) ? "comment" : itemKind;
	}

	return { docs, alignmentGroupId };
}

function grouped(contents, alignmentGroupId) {
	return alignmentGroupId
		? group(contents, { id: alignmentGroupId })
		: group(contents);
}

function contentColumnOffset(path, options) {
	return stringLineIndentDepth(path) * (options.tabWidth ?? 2);
}

function trailingCommentSuffix(entries, index) {
	return isCommaToken(entries[index + 1]?.node) ? "," : "";
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

	const { docs, alignmentGroupId } = sequenceDocs(
		entries,
		options,
		"part",
		contentColumnOffset(path, options),
	);
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

	const { docs, alignmentGroupId } = sequenceDocs(
		entries,
		options,
		"arg",
		contentColumnOffset(path, options),
	);
	const contents = [head, "[", indent([softline, ...docs]), softline, "]"];

	const shouldBreak = shouldBreakCommentedSpecialCall(node, options, entries);
	return alignmentGroupId
		? group(contents, { id: alignmentGroupId, shouldBreak })
		: group(contents, { shouldBreak });
}

// src/translator/nodes/group.js
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
const { group, indent, softline, line, hardline } = builders;

const GROUP_DELIMITERS = {
	GroupSquare: ["[", "]"],
	GroupCurly: ["{", "}"],
	GroupParen: ["(", ")"],
	GroupDoubleBracket: ["[[", "]]"],
	List: ["{", "}"],
	Association: ["<|", "|>"],
};

const BRACKET_KINDS = new Set([
	"Token`OpenCurly",
	"Token`CloseCurly",
	"Token`OpenSquare",
	"Token`CloseSquare",
	"Token`OpenParen",
	"Token`CloseParen",
	"Token`LessBar",
	"Token`BarGreater",
]);

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

function commentBoundary(leftEntry, rightEntry, options, fallback = line) {
	if (!leftEntry || !rightEntry) return fallback;
	return commentBoundarySeparator(
		leftEntry.node,
		rightEntry.node,
		options,
		fallback,
	);
}

function sequenceEntries(path, print, node) {
	// The comma-separated contents are wrapped in a single InfixNode[Comma].
	// Flatten that wrapper wherever it sits so its rules become individual
	// entries even when siblings (e.g. comments) keep it from being the sole
	// content of the group.
	const wrapperIdx = node.children.findIndex(
		(child) => child.type === "InfixNode" && child.op === "Comma",
	);

	return node.children.reduce((entries, child, idx) => {
		if (isTrivia(child) || isBracketToken(child)) return entries;

		if (idx === wrapperIdx) {
			child.children.forEach((wrappedChild, wrappedIdx) => {
				if (isTrivia(wrappedChild)) return;
				entries.push({
					node: wrappedChild,
					doc: path.call(print, "children", idx, "children", wrappedIdx),
					path: ["children", idx, "children", wrappedIdx],
				});
			});
			return entries;
		}

		entries.push({
			node: child,
			doc: path.call(print, "children", idx),
			path: ["children", idx],
		});
		return entries;
	}, []);
}

function contentColumnOffset(path, options) {
	return stringLineIndentDepth(path) * (options.tabWidth ?? 2);
}

function trailingCommentSuffix(entries, index) {
	return isCommaToken(entries[index + 1]?.node) ? "," : "";
}

export function printGroup(path, options, print, node) {
	options = normalizeWolframOptions(options);
	const [open, close] = GROUP_DELIMITERS[node.kind] ?? ["{", "}"];
	const entries = withMarkedTrailingCommentDocs(
		withAlignedRuleValues(
			sequenceEntries(path, print, node),
			path,
			options,
			print,
		),
		options,
	);

	if (entries.length === 0) return `${open}${close}`;

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
					contentColumnOffset(path, options),
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
		previousKind = isComment(entry.node) ? "comment" : "item";
	}

	if (docs.length === 0) return `${open}${close}`;

	const contents = [open, indent([softline, ...docs]), softline, close];

	return alignmentGroupId
		? group(contents, { id: alignmentGroupId })
		: group(contents);
}

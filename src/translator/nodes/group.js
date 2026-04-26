// src/translator/nodes/group.js
import { doc } from "prettier";
const { builders } = doc;
import { isComment, isTrivia } from "./leaf.js";
import { alignedRuleDoc, withAlignedRuleValues } from "../ruleAlignment.js";
const { group, indent, softline, line } = builders;

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
	return node.type === "LeafNode" && node.kind === "Token`Comma";
}

function sequenceEntries(path, print, node) {
	const contents = node.children.filter(
		(child) => !isTrivia(child) && !isBracketToken(child),
	);

	if (
		contents.length === 1 &&
		contents[0].type === "InfixNode" &&
		contents[0].op === "Comma"
	) {
		const wrapperIdx = node.children.indexOf(contents[0]);
		return contents[0].children.reduce((entries, child, idx) => {
			if (isTrivia(child)) return entries;
			entries.push({
				node: child,
				doc: path.call(print, "children", wrapperIdx, "children", idx),
				path: ["children", wrapperIdx, "children", idx],
			});
			return entries;
		}, []);
	}

	return node.children.reduce((entries, child, idx) => {
		if (isTrivia(child) || isBracketToken(child)) return entries;
		entries.push({
			node: child,
			doc: path.call(print, "children", idx),
			path: ["children", idx],
		});
		return entries;
	}, []);
}

export function printGroup(path, options, print, node) {
	const [open, close] = GROUP_DELIMITERS[node.kind] ?? ["{", "}"];
	const entries = withAlignedRuleValues(
		sequenceEntries(path, print, node),
		path,
		options,
		print,
	);

	if (entries.length === 0) return `${open}${close}`;

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
		previousKind = isComment(entry.node) ? "comment" : "item";
	}

	if (docs.length === 0) return `${open}${close}`;

	const contents = [open, indent([softline, ...docs]), softline, close];

	return alignmentGroupId
		? group(contents, { id: alignmentGroupId })
		: group(contents);
}

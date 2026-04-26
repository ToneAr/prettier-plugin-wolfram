// src/translator/nodes/binary.js
import { doc } from "prettier";
const { builders } = doc;
import { isTrivia } from "./leaf.js";
import { argPathEntries } from "./call.js";
import { wantsSpacesAroundOperator } from "../../utils/operatorSpacing.js";
import {
	hasImmediateComment,
	printOriginalSource,
} from "../sourcePreservation.js";
const { group, indent, line, softline } = builders;
const { willBreak } = doc.utils;

const OP_DISPLAY = {
	Set: "=",
	SetDelayed: ":=",
	Power: "^",
	ReplaceAll: "/.",
	Divide: "/",
	Map: "/@",
	Apply: "@@",
	MapApply: "@@@",
	MapAll: "//@",
	BinaryAt: "@",
	BinarySlashSlash: "//",
	Rule: "->",
	RuleDelayed: ":>",
	TagSet: "/: =",
	TagSetDelayed: "/: :=",
	UpSet: "^=",
	UpSetDelayed: "^:=",
	PatternTest: "?",
	Condition: "/;",
	MessageName: "::",
};

function isSemanticTokenLeaf(node) {
	return (
		node?.type === "LeafNode" &&
		[
			"Token`Hash",
			"Token`HashHash",
			"Token`Under",
			"Token`UnderUnder",
			"Token`UnderUnderUnder",
		].includes(node.kind)
	);
}

function isFakeTokenLeaf(node) {
	return node?.type === "LeafNode" && node.kind.startsWith("Token`Fake`");
}

function isOperatorTokenLeaf(node) {
	return (
		node?.type === "LeafNode" &&
		node.kind.startsWith("Token`") &&
		!isSemanticTokenLeaf(node) &&
		!isFakeTokenLeaf(node)
	);
}

function lhsRhs(node) {
	const semantic = node.children.filter(
		(c) =>
			!isTrivia(c) &&
			!(
				c.type === "LeafNode" &&
				c.kind.startsWith("Token`") &&
				!isSemanticTokenLeaf(c)
			),
	);
	return [semantic[0], semantic[1]];
}

function operatorToken(node) {
	const tokens = node.children.filter(
		(c) => !isTrivia(c) && isOperatorTokenLeaf(c),
	);
	return tokens.length === 1 ? tokens[0] : null;
}

function printSpan(node, print) {
	const semantic = node.children.filter((c) => !isTrivia(c));
	const tokenIndex = semantic.findIndex(
		(c) => isOperatorTokenLeaf(c) && c.value === ";;",
	);
	if (tokenIndex === -1) return null;
	const lhs = semantic
		.slice(0, tokenIndex)
		.find((c) => !isOperatorTokenLeaf(c));
	const rhs = semantic
		.slice(tokenIndex + 1)
		.find((c) => !isOperatorTokenLeaf(c));

	return group([
		lhs && !isFakeTokenLeaf(lhs) ? print(lhs) : "",
		";;",
		rhs && !isFakeTokenLeaf(rhs) ? print(rhs) : "",
	]);
}

function isMultilineStringJoin(node) {
	if (
		node?.type !== "CallNode" ||
		node.head?.type !== "LeafNode" ||
		node.head.kind !== "Symbol" ||
		node.head.value !== "StringJoin"
	) {
		return false;
	}

	return (
		argPathEntries(node).filter(
			(entry) =>
				!(
					entry.node?.type === "LeafNode" &&
					entry.node.kind === "Token`Comma"
				),
		).length > 1
	);
}

function isMultilineStringLeaf(node, printedDoc) {
	return (
		node?.type === "LeafNode" &&
		node.kind === "String" &&
		willBreak(printedDoc)
	);
}

export function printBinary(node, options, print) {
	if (hasImmediateComment(node)) {
		return printOriginalSource(node, options);
	}

	if (node.op === "Span") {
		return printSpan(node, print) ?? printOriginalSource(node, options);
	}

	const token = operatorToken(node);
	const opStr = token?.value ?? OP_DISPLAY[node.op] ?? node.op;
	const space = wantsSpacesAroundOperator(node, options, token);
	const [lhs, rhs] = lhsRhs(node);
	if (!lhs || !rhs) {
		return printOriginalSource(node, options);
	}
	const gap = space ? " " : "";
	const lhsDoc = print(lhs);
	const rhsDoc = print(rhs);
	const rhsWillBreak =
		isMultilineStringLeaf(rhs, rhsDoc) || isMultilineStringJoin(rhs);

	if (node.op === "BinaryAt" || node.op === "BinarySlashSlash") {
		return group([
			lhsDoc,
			`${gap}${opStr}`,
			space ? line : softline,
			rhsDoc,
		]);
	}

	if (!space) {
		if (rhsWillBreak) {
			return group([lhsDoc, opStr, indent([line, rhsDoc])]);
		}

		return group([lhsDoc, opStr, rhsDoc]);
	}

	if (
		[
			"Power",
			"Divide",
			"ReplaceAll",
			"Rule",
			"RuleDelayed",
			"Map",
			"Apply",
			"MapApply",
			"MapAll",
		].includes(node.op)
	) {
		if (rhsWillBreak) {
			return group([lhsDoc, `${gap}${opStr}`, indent([line, rhsDoc])]);
		}

		return group([lhsDoc, `${gap}${opStr}`, `${gap}`, rhsDoc]);
	}

	return group([lhsDoc, `${gap}${opStr}`, indent([line, rhsDoc])]);
}

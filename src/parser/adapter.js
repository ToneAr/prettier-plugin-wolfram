import { makeLineIndex, nodeSource } from "./position.js";

const LEAF_KIND = { symbol: "Symbol", integer: "Integer", real: "Real", string: "String", comment: "Token`Comment" };

const GROUP_KIND = { "{": "List", "(": "Paren", "[": "Group", "<|": "Association" };
const GROUP_OPEN_LEAF = { "{": "Token`OpenCurly", "(": "Token`OpenParen", "[": "Token`OpenSquare", "<|": "Token`LessBar" };
const GROUP_CLOSE_LEAF = { "}": "Token`CloseCurly", ")": "Token`CloseParen", "]": "Token`CloseSquare", "|>": "Token`BarGreater" };

export function adapt(tree, source) {
	const lineIndex = makeLineIndex(source);
	const ctx = { source, lineIndex };
	const root = tree.rootNode;
	return {
		type: "ContainerNode",
		kind: "String",
		children: namedChildren(root).map((c) => adaptNode(c, ctx)),
		source: nodeSource(root, lineIndex),
	};
}

// tree-sitter named children, including comment extras, in source order.
function namedChildren(node) {
	const out = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (c.isNamed) out.push(c);
	}
	return out;
}

function leaf(node, ctx, kind = LEAF_KIND[node.type]) {
	return { type: "LeafNode", kind, value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
}

function adaptNode(node, ctx) {
	switch (node.type) {
		case "symbol": case "integer": case "real": case "string": case "comment":
			return leaf(node, ctx);
		case "group": return adaptGroup(node, ctx);
		case "call": return adaptCall(node, ctx, "Token`OpenSquare", "[", "Token`CloseSquare", "]");
		case "part": return adaptCall(node, ctx, "Token`OpenSquare`OpenSquare", "[[", "Token`CloseSquare`CloseSquare", "]]");
		case "ERROR": case "MISSING":
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
		default:
			// Filled in by later tasks (infix/binary/prefix/postfix/span/pattern).
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
	}
}

function adaptGroup(node, ctx) {
	const open = node.child(0);
	const openText = ctx.source.slice(open.startIndex, open.endIndex);
	const close = node.child(node.childCount - 1);
	const closeText = ctx.source.slice(close.startIndex, close.endIndex);
	const children = [delimLeaf(open, GROUP_OPEN_LEAF[openText], openText, ctx)];
	for (const c of namedChildren(node)) children.push(adaptArguments(c, ctx));
	children.push(delimLeaf(close, GROUP_CLOSE_LEAF[closeText], closeText, ctx));
	return { type: "GroupNode", kind: GROUP_KIND[openText], children, source: nodeSource(node, ctx.lineIndex) };
}

function adaptCall(node, ctx, openKind, openText, closeKind, closeText) {
	const headNode = node.childForFieldName("head");
	const argsNode = node.childForFieldName("arguments");
	const open = firstAnon(node, openText, ctx);
	const close = firstAnon(node, closeText, ctx);
	const children = [delimLeaf(open, openKind, openText, ctx)];
	if (argsNode) children.push(adaptArguments(argsNode, ctx));
	children.push(delimLeaf(close, closeKind, closeText, ctx));
	return { type: "CallNode", head: adaptNode(headNode, ctx), children, source: nodeSource(node, ctx.lineIndex) };
}

function firstAnon(node, text, ctx) {
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed && ctx.source.slice(c.startIndex, c.endIndex) === text) return c;
	}
	return node; // defensive
}

function delimLeaf(node, kind, value, ctx) {
	return { type: "LeafNode", kind, value, source: nodeSource(node, ctx.lineIndex) };
}

// Until Task 8, arguments are a single expression; Task 8 replaces this with comma flattening.
function adaptArguments(node, ctx) { return adaptNode(node, ctx); }

export { adaptNode, namedChildren, leaf };

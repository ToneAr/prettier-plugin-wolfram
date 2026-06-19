import { makeLineIndex, nodeSource } from "./position.js";

const LEAF_KIND = { symbol: "Symbol", integer: "Integer", real: "Real", string: "String", comment: "Token`Comment" };

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
		case "ERROR": case "MISSING":
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
		default:
			// Filled in by later tasks (group/call/infix/binary/prefix/postfix/part/span/pattern).
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
	}
}

export { adaptNode, namedChildren, leaf };

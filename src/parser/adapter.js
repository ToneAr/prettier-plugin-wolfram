import { makeLineIndex, nodeSource, offsetToLineCol } from "./position.js";
import { INFIX_OPS, BINARY_OPS, PREFIX_OPS, POSTFIX_OPS, opName } from "./operators.js";

const LEAF_KIND = { symbol: "Symbol", integer: "Integer", real: "Real", string: "String", comment: "Token`Comment" };

const GROUP_KIND = { "{": "List", "(": "GroupParen", "[": "Group", "<|": "Association" };
const GROUP_OPEN_LEAF = { "{": "Token`OpenCurly", "(": "Token`OpenParen", "[": "Token`OpenSquare", "<|": "Token`LessBar" };
const GROUP_CLOSE_LEAF = { "}": "Token`CloseCurly", ")": "Token`CloseParen", "]": "Token`CloseSquare", "|>": "Token`BarGreater" };

export function adapt(tree, source) {
	const lineIndex = makeLineIndex(source);
	const ctx = { source, lineIndex };
	const root = tree.rootNode;
	if (subtreeHasError(root)) {
		const src = nodeSource(root, lineIndex);
		return { type: "ContainerNode", kind: "String", children: [{ type: "Unknown", kind: "SyntaxErrorNode[]", source: src }], source: src };
	}
	return {
		type: "ContainerNode",
		kind: "String",
		children: namedChildren(root).map((c) => adaptNode(c, ctx)),
		source: nodeSource(root, lineIndex),
	};
}

function subtreeHasError(node) {
	if (node.type === "ERROR" || node.isMissing) return true;
	for (let i = 0; i < node.childCount; i++) if (subtreeHasError(node.child(i))) return true;
	return false;
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
		case "infix": return adaptInfix(node, ctx);
		case "binary": return adaptBinary(node, ctx);
		case "prefix": return adaptPrefix(node, ctx);
		case "postfix": return adaptPostfix(node, ctx);
		case "pattern": return adaptPattern(node, ctx);
		case "blank": case "blank_sequence": case "blank_null_sequence":
			return adaptBlank(node, ctx);
		case "ERROR": case "MISSING":
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
		default:
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

// Return the first unnamed child's text — this is the operator literal for an infix node.
function operatorLiteral(node, ctx) {
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) return ctx.source.slice(c.startIndex, c.endIndex);
	}
	return null;
}

// Map operator literal to the CodeParser token kind suffix.
const TOKEN_KIND_NAME = {
	",": "Comma", "+": "Plus", "-": "Minus", "*": "Star", ";": "Semi", ".": "Dot",
	"=": "Equal", "&": "Amp", ":=": "ColonEqual", "^=": "CaretEqual", "^:=": "CaretColonEqual",
	"->": "MinusGreater", ":>": "ColonGreater", "<->": "LessMinusGreater", "|->": "BarMinusGreater",
	"/;": "SlashSemi", "/.": "SlashDot", "//.": "SlashSlashDot",
	"/:": "SlashColon", "//": "SlashSlash", "//=": "SlashSlashEqual",
	"+=": "PlusEqual", "-=": "MinusEqual", "*=": "StarEqual", "/=": "SlashEqual",
	"^": "Caret", "@": "At", "@@": "AtAt", "@@@": "AtAtAt",
	"/@": "SlashAt", "//@": "SlashSlashAt", "?": "Question", ":": "Colon",
	"!": "Bang", "!!": "BangBang", "++": "PlusPlus", "--": "MinusMinus",
	"..": "DotDot", "...": "DotDotDot", "'": "SingleQuote", "=.": "EqualDot",
	// comparison operators
	">": "Greater", "<": "Less", ">=": "GreaterEqual", "<=": "LessEqual",
	"==": "EqualEqual", "!=": "BangEqual", "===": "TripleEqual", "=!=": "EqualBangEqual",
	// division
	"/": "Slash",
	// blank tokens
	"_": "Under", "__": "UnderUnder", "___": "UnderUnderUnder",
};

const INEQUALITY_OPS = new Set(["<", "<=", ">", ">=", "==", "!=", "===", "=!="]);
const RIGHT_ASSOC_BINARY = new Set(["=", ":=", "^=", "^:="]);

const BLANK_OP = { "_": "Blank", "__": "BlankSequence", "___": "BlankNullSequence" };
const PATTERN_OP = { "_": "PatternBlank", "__": "PatternBlankSequence", "___": "PatternBlankNullSequence" };
function tokenKindName(literal) {
	return TOKEN_KIND_NAME[literal] ?? "Operator";
}

// Recursively collapse a left-assoc chain of the same infix operator into a flat children array.
// Appends to out.children: [operand, opLeaf, ..., operand, opLeaf, operand]
function flattenInfix(node, literal, ctx, out) {
	const named = [];
	const anonsBetween = []; // anonymous tokens between each pair of named children
	let seenNamed = 0;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (c.isNamed) {
			seenNamed++;
			named.push(c);
			if (seenNamed < node.childCount) anonsBetween.push([]);
		} else {
			if (anonsBetween.length > 0) anonsBetween[anonsBetween.length - 1].push(c);
		}
	}
	// named[0] is LHS, named[named.length-1] is RHS; anonsBetween[i] are tokens between named[i] and named[i+1]
	const lhs = named[0];
	if (lhs.type === "infix" && operatorLiteral(lhs, ctx) === literal) {
		flattenInfix(lhs, literal, ctx, out);
	} else {
		out.children.push(adaptNode(lhs, ctx));
	}
	// Emit the anonymous tokens (operator) between LHS and RHS, then RHS
	for (const t of anonsBetween[0] ?? []) {
		const text = ctx.source.slice(t.startIndex, t.endIndex);
		out.children.push({ type: "LeafNode", kind: `Token\`${tokenKindName(text)}`, value: text, source: nodeSource(t, ctx.lineIndex) });
	}
	out.children.push(adaptNode(named[named.length - 1], ctx));
}

function adaptInfix(node, ctx) {
	const literal = operatorLiteral(node, ctx);
	const op = INEQUALITY_OPS.has(literal) ? "InfixInequality" : opName(INFIX_OPS, literal);
	const out = { type: "InfixNode", op, children: [], source: nodeSource(node, ctx.lineIndex) };
	flattenInfix(node, literal, ctx, out);
	return out;
}

// A comma-separated argument list parses as an infix(",") chain; map to flat Comma InfixNode.
// Otherwise, adapt the single argument normally.
function adaptArguments(node, ctx) {
	if (node.type === "infix" && operatorLiteral(node, ctx) === ",") return adaptInfix(node, ctx);
	return adaptNode(node, ctx);
}

// Produce a LeafNode for an operator token.
function opLeaf(tokenNode, ctx) {
	const v = ctx.source.slice(tokenNode.startIndex, tokenNode.endIndex);
	return { type: "LeafNode", kind: `Token\`${tokenKindName(v)}`, value: v, source: nodeSource(tokenNode, ctx.lineIndex) };
}

// Separate a node's children into named (operands) and unnamed (operator tokens).
function parts(node) {
	const named = [], tokens = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		(c.isNamed ? named : tokens).push(c);
	}
	return { named, tokens };
}

function collectBinaryChain(node, literal, ctx, operands, opTokens) {
	if (node.type !== "binary") { operands.push(node); return; }
	const { named, tokens } = parts(node);
	const lit = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	if (lit !== literal) { operands.push(node); return; }
	collectBinaryChain(named[0], literal, ctx, operands, opTokens);
	opTokens.push(tokens[0]);
	operands.push(named[1]);
}

function adaptBinaryRight(node, literal, op, ctx) {
	const operands = [], opTokens = [];
	collectBinaryChain(node, literal, ctx, operands, opTokens);
	const last = operands[operands.length - 1];
	let rhs = adaptNode(last, ctx);
	for (let i = operands.length - 2; i >= 0; i--) {
		const lhs = adaptNode(operands[i], ctx);
		const src = [offsetToLineCol(ctx.lineIndex, operands[i].startIndex), offsetToLineCol(ctx.lineIndex, last.endIndex)];
		rhs = { type: "BinaryNode", op, children: [lhs, opLeaf(opTokens[i], ctx), rhs], source: src };
	}
	return rhs;
}

function adaptBinary(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	const op = opName(BINARY_OPS, literal);
	if (RIGHT_ASSOC_BINARY.has(literal)) return adaptBinaryRight(node, literal, op, ctx);
	return {
		type: "BinaryNode",
		op,
		children: [adaptNode(named[0], ctx), opLeaf(tokens[0], ctx), adaptNode(named[1], ctx)],
		source: nodeSource(node, ctx.lineIndex),
	};
}

function adaptPrefix(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	return {
		type: "PrefixNode",
		op: opName(PREFIX_OPS, literal),
		children: [opLeaf(tokens[0], ctx), adaptNode(named[0], ctx)],
		source: nodeSource(node, ctx.lineIndex),
	};
}

function adaptPostfix(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	return {
		type: "PostfixNode",
		op: opName(POSTFIX_OPS, literal),
		children: [adaptNode(named[0], ctx), opLeaf(tokens[0], ctx)],
		source: nodeSource(node, ctx.lineIndex),
	};
}

// blank/blank_sequence/blank_null_sequence: "_", "__", "___" tokens, optionally followed by a head type.
// Returns LeafNode(Token`Under) when no head, CompoundNode(Blank/BlankSeq/BlankNullSeq, [...]) when there is one.
function adaptBlank(node, ctx) {
	const underToken = node.child(0);
	const underText = ctx.source.slice(underToken.startIndex, underToken.endIndex);
	const underLeaf = { type: "LeafNode", kind: `Token\`${tokenKindName(underText)}`, value: underText, source: nodeSource(underToken, ctx.lineIndex) };
	const headText = ctx.source.slice(underToken.endIndex, node.endIndex);
	if (!headText) return underLeaf;
	const headSource = [offsetToLineCol(ctx.lineIndex, underToken.endIndex), offsetToLineCol(ctx.lineIndex, node.endIndex)];
	const headLeaf = { type: "LeafNode", kind: "Symbol", value: headText, source: headSource };
	return { type: "CompoundNode", op: BLANK_OP[underText], children: [underLeaf, headLeaf], source: nodeSource(node, ctx.lineIndex) };
}

// pattern: symbol followed by blank/blank_sequence/blank_null_sequence.
function adaptPattern(node, ctx) {
	const nc = namedChildren(node);
	const symLeaf = leaf(nc[0], ctx, "Symbol");
	const blankNode = nc[1];
	const underToken = blankNode.child(0);
	const underText = ctx.source.slice(underToken.startIndex, underToken.endIndex);
	const underLeaf = { type: "LeafNode", kind: `Token\`${tokenKindName(underText)}`, value: underText, source: nodeSource(underToken, ctx.lineIndex) };
	const headText = ctx.source.slice(underToken.endIndex, blankNode.endIndex);
	const patternOp = PATTERN_OP[underText];
	if (!headText) {
		return { type: "CompoundNode", op: patternOp, children: [symLeaf, underLeaf], source: nodeSource(node, ctx.lineIndex) };
	}
	const headSource = [offsetToLineCol(ctx.lineIndex, underToken.endIndex), offsetToLineCol(ctx.lineIndex, blankNode.endIndex)];
	const headLeaf = { type: "LeafNode", kind: "Symbol", value: headText, source: headSource };
	const blankCompound = { type: "CompoundNode", op: BLANK_OP[underText], children: [underLeaf, headLeaf], source: nodeSource(blankNode, ctx.lineIndex) };
	return { type: "CompoundNode", op: patternOp, children: [symLeaf, blankCompound], source: nodeSource(node, ctx.lineIndex) };
}

export { adaptNode, namedChildren, leaf };

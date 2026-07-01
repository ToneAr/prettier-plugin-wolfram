import { makeLineIndex, nodeSource, offsetToLineCol } from "./position.js";
import { INFIX_OPS, BINARY_OPS, PREFIX_OPS, POSTFIX_OPS, opName } from "./operators.js";
import { IMPLICIT_NULL_SYMBOL } from "./sentinels.js";

const LEAF_KIND = { symbol: "Symbol", integer: "Integer", real: "Real", string: "String", comment: "Token`Comment" };

const GROUP_KIND = { "{": "List", "(": "GroupParen", "[": "Group", "<|": "Association" };
const GROUP_OPEN_LEAF = { "{": "Token`OpenCurly", "(": "Token`OpenParen", "[": "Token`OpenSquare", "<|": "Token`LessBar" };
const GROUP_CLOSE_LEAF = { "}": "Token`CloseCurly", ")": "Token`CloseParen", "]": "Token`CloseSquare", "|>": "Token`BarGreater" };

// preprocessedSource is the version passed to tree-sitter (may have ⁢ for InvisibleTimes);
// source is the original — used only for the unformattable fallback.
// map (optional) translates preprocessed char offsets back to original offsets;
// it is attached to lineIndex so nodeSource can record exact original positions.
export function adapt(tree, source, preprocessedSource, map) {
	const ps = preprocessedSource ?? source;
	const lineIndex = makeLineIndex(ps);
	lineIndex.map = map;
	const ctx = { source: ps, lineIndex };
	const root = tree.rootNode;
	if (subtreeHasError(root)) {
		// Use original source positions for the error fallback so the printer can
		// emit the unmodified source text verbatim.
		const errLineIndex = makeLineIndex(source);
		const src = nodeSource(root, errLineIndex);
		return { type: "ContainerNode", kind: "String", children: [{ type: "Unknown", kind: "SyntaxErrorNode[]", source: src }], source: src };
	}
	// Hoist top-level semicolon chains into separate ContainerNode children,
	// matching the CodeParser output structure. This must happen for multiline
	// chains even when the final expression is not followed by a trailing ";",
	// otherwise the printer sees one giant CompoundExpression and cannot apply
	// top-level definition spacing between adjacent definitions.
	const children = [];
	for (const c of namedChildren(root)) {
		if (shouldHoistTopLevelSemicolonChain(c, ctx)) {
			hoistSemicolonChildren(c, ctx, children);
		} else {
			children.push(adaptNode(c, ctx));
		}
	}
	return {
		type: "ContainerNode",
		kind: "String",
		children,
		source: nodeSource(root, lineIndex),
	};
}

function shouldHoistTopLevelSemicolonChain(node, ctx) {
	if (node.type !== "infix" || operatorLiteral(node, ctx) !== ";") return false;
	return hasTrailingSemicolon(node, ctx) || spansMultipleLines(node, ctx);
}

// Returns true if the infix node ends with ";" and has no real RHS. Raw trailing
// semicolons may be represented as a MISSING node, while preprocessed ones use
// the internal fake-null symbol.
function hasTrailingSemicolon(node, ctx) {
	for (let i = node.childCount - 1; i >= 0; i--) {
		const child = node.child(i);
		if (child.isMissing) return true;
		if (child.isNamed) {
			if (child.type === "comment") continue;
			if (isImplicitNullSymbol(child, ctx)) return true;
			return false;
		}
		return child.type === ";";
	}
	return false;
}

function spansMultipleLines(node, ctx) {
	const source = nodeSource(node, ctx.lineIndex);
	return source?.[0]?.[0] !== source?.[1]?.[0];
}

function isImplicitNullSymbol(node, ctx) {
	return (
		node?.type === "symbol" &&
		ctx.source.slice(node.startIndex, node.endIndex) === IMPLICIT_NULL_SYMBOL
	);
}

// Collect all leaf statements from a semicolon infix chain (possibly left-recursive),
// flattening the left-associative structure into a linear list of segments.
// Each segment is { nodes: TSNode[], semiToken: TSNode|null } where semiToken is the ";" that follows.
function collectSemicolonSegments(node, ctx, segments) {
	// A semicolon infix has children: [lhs, ";", rhs] or with comments interspersed.
	// The lhs may itself be a semicolon infix (left-assoc chaining).
	let lhs = null, semiToken = null, rhs = null;
	const leadingComments = [];
	const boundaryComments = [];

	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) {
			// ";" operator token
			semiToken = c;
		} else if (c.isMissing || isImplicitNullSymbol(c, ctx)) {
			// trailing implicit null — rhs is nothing (trailing semicolon)
		} else if (c.type === "comment") {
			if (lhs === null) leadingComments.push(c);
			else boundaryComments.push(c);
		} else if (lhs === null) {
			lhs = c;
		} else {
			rhs = c;
		}
	}

	const trailingComments = [];
	const rhsLeadingComments = [];
	for (const c of boundaryComments) {
		if (rhs !== null && isLeadingCommentForNextSegment(c, semiToken, ctx)) {
			rhsLeadingComments.push(c);
		} else {
			trailingComments.push(c);
		}
	}

	if (lhs !== null && lhs.type === "infix" && operatorLiteral(lhs, ctx) === ";") {
		const segmentStart = segments.length;
		// Flatten the left subtree
		collectSemicolonSegments(lhs, ctx, segments);
		if (segments.length > segmentStart) {
			segments[segmentStart].leadingComments.unshift(...leadingComments);
		}
		// The last segment from lhs should get the semiToken we found
		if (segments.length > 0 && semiToken !== null) {
			segments[segments.length - 1].semiToken = semiToken;
		}
		for (const c of trailingComments) {
			if (segments.length > 0) segments[segments.length - 1].trailingComments.push(c);
		}
	} else {
		// Push lhs as a new segment
		const nodes = [];
		if (lhs !== null) nodes.push(lhs);
		segments.push({ nodes, semiToken, leadingComments, trailingComments });
	}

	// Push rhs as the next segment (no semiToken yet — will be set by caller if needed)
	if (rhs !== null) {
		segments.push({ nodes: [rhs], semiToken: null, leadingComments: rhsLeadingComments, trailingComments: [] });
	}
}

function isLeadingCommentForNextSegment(comment, semiToken, ctx) {
	if (!semiToken) return false;
	const semiEndLine = nodeSource(semiToken, ctx.lineIndex)?.[1]?.[0];
	const commentStartLine = nodeSource(comment, ctx.lineIndex)?.[0]?.[0];
	return Number.isFinite(semiEndLine) && Number.isFinite(commentStartLine) && commentStartLine > semiEndLine;
}

// Hoist top-level semicolon-separated statements into separate ContainerNode children.
// For `a; b; c;`, produces [CompoundExpr(a;Null), CompoundExpr(b;Null), CompoundExpr(c;Null)].
// For `a; b`, produces [CompoundExpr(a;Null), b].
function hoistSemicolonChildren(node, ctx, out) {
	const segments = [];
	collectSemicolonSegments(node, ctx, segments);
	emitSemicolonSegments(segments, ctx, out);
}

function emitSemicolonSegments(segments, ctx, out) {
	for (const seg of segments) {
		for (const c of seg.leadingComments ?? []) out.push(leaf(c, ctx));
		if (seg.nodes.length === 0) continue;

		const adaptedNodes = seg.nodes.map(n => adaptNode(n, ctx));
		const src = nodeSource(seg.nodes[0], ctx.lineIndex);

		if (seg.semiToken !== null) {
			// This statement had a trailing ";" — wrap in CompoundExpression
			const semiLeaf = { type: "LeafNode", kind: "Token`Semi", value: ";", source: nodeSource(seg.semiToken, ctx.lineIndex) };
			const implicitNullLeaf = { type: "LeafNode", kind: "Token`Fake`ImplicitNull", value: "", source: nodeSource(seg.semiToken, ctx.lineIndex) };
			const trailingCommentLeaves = seg.trailingComments.map(c => leaf(c, ctx));
			out.push({ type: "InfixNode", op: "CompoundExpression", children: [...adaptedNodes, semiLeaf, ...trailingCommentLeaves, implicitNullLeaf], source: src });
		} else {
			// No trailing semicolon — emit the node directly
			out.push(...adaptedNodes);
		}
	}
}

// A MISSING node that is the last child of a ";" infix represents trailing-semicolon implicit null —
// a valid Wolfram Language construct. Allow it rather than treating it as a parse error.
// Note: web-tree-sitter returns new JS wrappers each time, so use .id for identity comparison.
function isTrailingSemicolonImplicitNull(node) {
	if (!node.isMissing) return false;
	const parent = node.parent;
	if (!parent || parent.type !== "infix") return false;
	// The last child must be this MISSING node (compare by id)
	const lastIdx = parent.childCount - 1;
	if (parent.child(lastIdx).id !== node.id) return false;
	// Find the last unnamed child (the operator) and check it's ";"
	for (let i = lastIdx - 1; i >= 0; i--) {
		const c = parent.child(i);
		if (!c.isNamed) return c.type === ";";
	}
	return false;
}

function subtreeHasError(node) {
	if (node.type === "ERROR") return true;
	if (node.isMissing && !isTrailingSemicolonImplicitNull(node)) return true;
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
	if (isImplicitNullSymbol(node, ctx)) {
		return { type: "LeafNode", kind: "Token`Fake`ImplicitNull", value: "", source: nodeSource(node, ctx.lineIndex) };
	}
	return { type: "LeafNode", kind, value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
}

function adaptNode(node, ctx) {
	switch (node.type) {
		case "symbol": case "integer": case "real": case "string": case "comment":
			return leaf(node, ctx);
		case "group": return adaptGroup(node, ctx);
		case "call": return adaptCall(node, ctx, "Token`OpenSquare", "[", "Token`CloseSquare", "]");
		case "part": return adaptPart(node, ctx);
		case "infix": return adaptInfix(node, ctx);
		case "binary": return adaptBinary(node, ctx);
		case "prefix": return adaptPrefix(node, ctx);
		case "postfix": return adaptPostfix(node, ctx);
		case "pattern": return adaptPattern(node, ctx);
		case "blank": case "blank_sequence": case "blank_null_sequence":
			return adaptBlank(node, ctx);
		case "slot": return adaptSlot(node, ctx);
		case "slot_sequence": return adaptSlotSequence(node, ctx);
		case "out": return adaptOut(node, ctx);
		case "message_name": return adaptMessageName(node, ctx);
		case "get": return adaptGet(node, ctx);
		case "put": return adaptPut(node, ctx);
		case "tilde_infix": return adaptTildeInfix(node, ctx);
		case "span": return adaptSpan(node, ctx);
		case "ERROR":
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
		default:
			// MISSING nodes that passed subtreeHasError (i.e. trailing semicolon implicit null)
			if (node.isMissing) return { type: "LeafNode", kind: "Token`Fake`ImplicitNull", value: "", source: nodeSource(node, ctx.lineIndex) };
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
	}
}

function adaptGroup(node, ctx) {
	const open = node.child(0);
	const openText = ctx.source.slice(open.startIndex, open.endIndex);
	const close = node.child(node.childCount - 1);
	const closeText = ctx.source.slice(close.startIndex, close.endIndex);
	const children = [delimLeaf(open, GROUP_OPEN_LEAF[openText], openText, ctx)];
	// Collect all named children in source order, injecting whitespace trivia between them.
	let lastIdx = open.endIndex;
	for (const c of namedChildren(node)) {
		for (const t of triviaLeaves(lastIdx, c.startIndex, ctx)) children.push(t);
		if (c.type === "comment") children.push(leaf(c, ctx));
		else children.push(adaptArguments(c, ctx));
		lastIdx = c.endIndex;
	}
	for (const t of triviaLeaves(lastIdx, close.startIndex, ctx)) children.push(t);
	children.push(delimLeaf(close, GROUP_CLOSE_LEAF[closeText], closeText, ctx));
	return { type: "GroupNode", kind: GROUP_KIND[openText], children, source: nodeSource(node, ctx.lineIndex) };
}

function adaptCall(node, ctx, openKind, openText, closeKind, closeText) {
	const headNode = node.childForFieldName("head");
	const argsNode = node.childForFieldName("arguments");
	const open = firstAnon(node, openText, ctx);
	const close = firstAnon(node, closeText, ctx);
	const children = [delimLeaf(open, openKind, openText, ctx)];
	const openEnd = open.endIndex;
	const closeStart = close.startIndex;
	let lastIdx = openEnd;
	if (argsNode) {
		// Collect all named non-head children between delimiters (args + any comment extras)
		for (const c of namedChildren(node)) {
			if (c === headNode) continue;
			if (c.startIndex < openEnd || c.endIndex > closeStart) continue;
			for (const t of triviaLeaves(lastIdx, c.startIndex, ctx)) children.push(t);
			if (c.type === "comment") children.push(leaf(c, ctx));
			else children.push(adaptArguments(c, ctx));
			lastIdx = c.endIndex;
		}
	} else {
		// No arguments field: only comments (or truly empty) between delimiters
		for (const c of namedChildren(node)) {
			if (c === headNode) continue;
			if (c.type === "comment" && c.startIndex >= openEnd && c.endIndex <= closeStart) {
				for (const t of triviaLeaves(lastIdx, c.startIndex, ctx)) children.push(t);
				children.push(leaf(c, ctx));
				lastIdx = c.endIndex;
			}
		}
	}
	for (const t of triviaLeaves(lastIdx, closeStart, ctx)) children.push(t);
	children.push(delimLeaf(close, closeKind, closeText, ctx));
	return { type: "CallNode", head: adaptNode(headNode, ctx), children, source: nodeSource(node, ctx.lineIndex) };
}

// adaptPart: produces the CodeParser shape for list[[...]] which is
// CallNode(head, [Token`OpenSquare, GroupNode(GroupSquare, [Token`OpenSquare, content, Token`CloseSquare]), Token`CloseSquare])
// The tree-sitter "part" node uses "[[" and "]]" tokens; we split each into two "["/"]" leaves.
function adaptPart(node, ctx) {
	const headNode = node.childForFieldName("head");
	// Find the "[[" and "]]" anonymous tokens
	let openDoubleToken = null, closeDoubleToken = null;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) {
			const t = ctx.source.slice(c.startIndex, c.endIndex);
			if (t === "[[") openDoubleToken = c;
			else if (t === "]]") closeDoubleToken = c;
		}
	}
	// Split "[[" into outer "[" (first char) and inner "[" (second char)
	const outerOpenSrc = [offsetToLineCol(ctx.lineIndex, openDoubleToken.startIndex), offsetToLineCol(ctx.lineIndex, openDoubleToken.startIndex + 1)];
	const innerOpenSrc = [offsetToLineCol(ctx.lineIndex, openDoubleToken.startIndex + 1), offsetToLineCol(ctx.lineIndex, openDoubleToken.endIndex)];
	const outerOpenLeaf = { type: "LeafNode", kind: "Token`OpenSquare", value: "[", source: outerOpenSrc };
	const innerOpenLeaf = { type: "LeafNode", kind: "Token`OpenSquare", value: "[", source: innerOpenSrc };
	// Split "]]" into inner "]" (first char) and outer "]" (second char)
	const innerCloseSrc = [offsetToLineCol(ctx.lineIndex, closeDoubleToken.startIndex), offsetToLineCol(ctx.lineIndex, closeDoubleToken.startIndex + 1)];
	const outerCloseSrc = [offsetToLineCol(ctx.lineIndex, closeDoubleToken.startIndex + 1), offsetToLineCol(ctx.lineIndex, closeDoubleToken.endIndex)];
	const innerCloseLeaf = { type: "LeafNode", kind: "Token`CloseSquare", value: "]", source: innerCloseSrc };
	const outerCloseLeaf = { type: "LeafNode", kind: "Token`CloseSquare", value: "]", source: outerCloseSrc };
	// Build GroupNode(GroupSquare) wrapping the content. Iterate the named
	// children between the delimiters (args + any comment extras) in source
	// order, injecting whitespace trivia, so comments inside [[...]] survive —
	// previously only the `arguments` field was read and comments were dropped.
	const innerOpenEnd = openDoubleToken.startIndex + 1;
	const innerCloseStart = closeDoubleToken.startIndex;
	const groupChildren = [innerOpenLeaf];
	let lastIdx = innerOpenEnd;
	for (const c of namedChildren(node)) {
		if (c === headNode) continue;
		if (c.startIndex < innerOpenEnd || c.endIndex > innerCloseStart) continue;
		for (const t of triviaLeaves(lastIdx, c.startIndex, ctx)) groupChildren.push(t);
		if (c.type === "comment") groupChildren.push(leaf(c, ctx));
		else groupChildren.push(adaptArguments(c, ctx));
		lastIdx = c.endIndex;
	}
	for (const t of triviaLeaves(lastIdx, innerCloseStart, ctx)) groupChildren.push(t);
	groupChildren.push(innerCloseLeaf);
	const groupSrc = [offsetToLineCol(ctx.lineIndex, openDoubleToken.startIndex + 1), offsetToLineCol(ctx.lineIndex, closeDoubleToken.startIndex + 1)];
	const groupNode = { type: "GroupNode", kind: "GroupSquare", children: groupChildren, source: groupSrc };
	// Build CallNode
	const callChildren = [outerOpenLeaf, groupNode, outerCloseLeaf];
	return { type: "CallNode", head: adaptNode(headNode, ctx), children: callChildren, source: nodeSource(node, ctx.lineIndex) };
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

// Produce trivia LeafNodes for the gap between two character offsets.
// Splits on newlines and (*...*) comments (which may appear between tokens in right-associative
// binary nodes like :=). Each whitespace run → Token`Whitespace, each "\n" → Token`Newline,
// each (*...*) comment → Token`Comment.
function triviaLeaves(fromIdx, toIdx, ctx) {
	if (fromIdx >= toIdx) return [];
	const gap = ctx.source.slice(fromIdx, toIdx);
	if (gap.length === 0) return [];
	const leaves = [];
	let i = 0;
	while (i < gap.length) {
		const ch = gap[i];
		// Nested WL comment (*...*)
		if (ch === "(" && gap[i + 1] === "*") {
			const start = i;
			i += 2;
			let depth = 1;
			while (i < gap.length && depth > 0) {
				if (gap[i] === "(" && gap[i + 1] === "*") { depth++; i += 2; }
				else if (gap[i] === "*" && gap[i + 1] === ")") { depth--; i += 2; }
				else i++;
			}
			const commentText = gap.slice(start, i);
			const startChar = fromIdx + start;
			const endChar = fromIdx + i;
			const src = [offsetToLineCol(ctx.lineIndex, startChar), offsetToLineCol(ctx.lineIndex, endChar)];
			leaves.push({ type: "LeafNode", kind: "Token`Comment", value: commentText, source: src });
		} else if (ch === "\n") {
			const endChar = fromIdx + i + 1;
			const src = [offsetToLineCol(ctx.lineIndex, fromIdx + i), offsetToLineCol(ctx.lineIndex, endChar)];
			leaves.push({ type: "LeafNode", kind: "Token`Newline", value: "\n", source: src });
			i++;
		} else if (ch === "\r") {
			const nl = gap[i + 1] === "\n" ? "\r\n" : "\r";
			const endChar = fromIdx + i + nl.length;
			const src = [offsetToLineCol(ctx.lineIndex, fromIdx + i), offsetToLineCol(ctx.lineIndex, endChar)];
			leaves.push({ type: "LeafNode", kind: "Token`Newline", value: nl, source: src });
			i += nl.length;
		} else {
			// Collect run of non-comment, non-newline chars
			let j = i;
			while (j < gap.length && gap[j] !== "\n" && gap[j] !== "\r" && !(gap[j] === "(" && gap[j + 1] === "*")) j++;
			if (j === i) { i++; continue; } // safety: skip single unknown char
			const ws = gap.slice(i, j);
			const startChar = fromIdx + i;
			const endChar = fromIdx + j;
			const src = [offsetToLineCol(ctx.lineIndex, startChar), offsetToLineCol(ctx.lineIndex, endChar)];
			if (/\S/.test(ws)) {
				// Non-whitespace that isn't a comment — shouldn't happen in valid WL, skip it
				i = j;
				continue;
			}
			leaves.push({ type: "LeafNode", kind: "Token`Whitespace", value: ws, source: src });
			i = j;
		}
	}
	return leaves;
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
	// tier-1 gap constructs
	"::": "ColonColon", "<<": "LessLess", ">>": "GreaterGreater", ">>>": "GreaterGreaterGreater",
	"~": "Tilde", ";;": "SemiSemi",
	// string operators
	"<>": "LessGreater", "~~": "TildeTilde",
	// additional infix operators missing from original table
	"**": "StarStar", "|": "Bar", "||": "BarBar", "&&": "AmpAmp",
	"@*": "AtStar", "/*": "SlashStar",
	// InvisibleTimes: WL space-multiplication, encoded as U+2062 during preprocessing
	"⁢": "InvisibleTimes",
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
// Comments (tree-sitter extras) are threaded through in source order.
// Whitespace/newlines between children are injected as trivia nodes.
// Returns the endIndex of the last tree-sitter node processed (for trivia tracking).
function flattenInfix(node, literal, ctx, out) {
	let lastEndIndex = node.startIndex; // track end of last emitted node for trivia
	let operandCount = 0;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		// Inject trivia for the gap before this child
		for (const t of triviaLeaves(lastEndIndex, c.startIndex, ctx)) out.children.push(t);
		if (!c.isNamed) {
			// Operator token
			const text = ctx.source.slice(c.startIndex, c.endIndex);
			out.children.push({ type: "LeafNode", kind: `Token\`${tokenKindName(text)}`, value: text, source: nodeSource(c, ctx.lineIndex) });
			lastEndIndex = c.endIndex;
		} else if (c.type === "comment") {
			out.children.push(leaf(c, ctx));
			lastEndIndex = c.endIndex;
		} else {
			// Operand: if it's the first and is a same-op infix, flatten recursively
			if (operandCount === 0 && c.type === "infix" && operatorLiteral(c, ctx) === literal) {
				flattenInfix(c, literal, ctx, out);
				lastEndIndex = c.endIndex; // sub-infix ends at its endIndex
			} else {
				out.children.push(adaptNode(c, ctx));
				lastEndIndex = c.endIndex;
			}
			operandCount++;
		}
	}
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

// Separate a node's children into non-comment named operands and unnamed operator tokens,
// preserving source order. Also returns all children in source order for ordering-aware callers.
function parts(node) {
	const named = [], tokens = [], comments_ = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) tokens.push(c);
		else if (c.type === "comment") comments_.push(c);
		else named.push(c);
	}
	return { named, tokens, comments: comments_ };
}

// Collect all children of a node in source order as adapted CST nodes.
// Named non-comment children are adapted via adaptNode; comments become LeafNode(Token`Comment);
// unnamed tokens become operator LeafNodes. Whitespace between nodes is injected as trivia.
function adaptChildrenInOrder(node, ctx) {
	const out = [];
	let lastEndIndex = node.startIndex;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		for (const t of triviaLeaves(lastEndIndex, c.startIndex, ctx)) out.push(t);
		if (!c.isNamed) {
			out.push(opLeaf(c, ctx));
		} else if (c.type === "comment") {
			out.push(leaf(c, ctx));
		} else {
			out.push(adaptNode(c, ctx));
		}
		lastEndIndex = c.endIndex;
	}
	return out;
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
		const lhsNode = operands[i];
		const opToken = opTokens[i];
		const lhs = adaptNode(lhsNode, ctx);
		const src = [offsetToLineCol(ctx.lineIndex, lhsNode.startIndex), offsetToLineCol(ctx.lineIndex, last.endIndex)];
		// Inject whitespace between lhs and operator, and between operator and rhs
		const children = [lhs,
			...triviaLeaves(lhsNode.endIndex, opToken.startIndex, ctx),
			opLeaf(opToken, ctx),
			...triviaLeaves(opToken.endIndex, operands[i + 1].startIndex, ctx),
			rhs,
		];
		rhs = { type: "BinaryNode", op, children, source: src };
	}
	return rhs;
}

function adaptBinary(node, ctx) {
	const { tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	const op = opName(BINARY_OPS, literal);
	if (RIGHT_ASSOC_BINARY.has(literal)) return adaptBinaryRight(node, literal, op, ctx);
	// Iterate children in source order so comments between operands are preserved
	const children = adaptChildrenInOrder(node, ctx);
	return { type: "BinaryNode", op, children, source: nodeSource(node, ctx.lineIndex) };
}

function adaptPrefix(node, ctx) {
	const { tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	// Iterate in source order to preserve any comments between operator and operand
	const children = adaptChildrenInOrder(node, ctx);
	return { type: "PrefixNode", op: opName(PREFIX_OPS, literal), children, source: nodeSource(node, ctx.lineIndex) };
}

function adaptPostfix(node, ctx) {
	const { tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	// Iterate in source order to preserve any comments between operand and operator
	const children = adaptChildrenInOrder(node, ctx);
	return { type: "PostfixNode", op: opName(POSTFIX_OPS, literal), children, source: nodeSource(node, ctx.lineIndex) };
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

// slot: "#" optionally followed by integer or symbol name
function adaptSlot(node, ctx) {
	const hashToken = node.child(0); // the "#" anonymous token
	const hashLeaf = { type: "LeafNode", kind: "Token`Hash", value: "#", source: nodeSource(hashToken, ctx.lineIndex) };
	const suffix = ctx.source.slice(node.startIndex + 1, node.endIndex);
	if (!suffix) return hashLeaf;
	const suffixSource = [offsetToLineCol(ctx.lineIndex, node.startIndex + 1), offsetToLineCol(ctx.lineIndex, node.endIndex)];
	if (/^[0-9]+$/.test(suffix)) {
		const intLeaf = { type: "LeafNode", kind: "Integer", value: suffix, source: suffixSource };
		return { type: "CompoundNode", op: "Slot", children: [hashLeaf, intLeaf], source: nodeSource(node, ctx.lineIndex) };
	}
	const symLeaf = { type: "LeafNode", kind: "Symbol", value: suffix, source: suffixSource };
	return { type: "CompoundNode", op: "Slot", children: [hashLeaf, symLeaf], source: nodeSource(node, ctx.lineIndex) };
}

// slot_sequence: "##" optionally followed by integer
function adaptSlotSequence(node, ctx) {
	const hashHashToken = node.child(0); // the "##" anonymous token
	const hashHashLeaf = { type: "LeafNode", kind: "Token`HashHash", value: "##", source: nodeSource(hashHashToken, ctx.lineIndex) };
	const suffix = ctx.source.slice(node.startIndex + 2, node.endIndex);
	if (!suffix) return hashHashLeaf;
	const suffixSource = [offsetToLineCol(ctx.lineIndex, node.startIndex + 2), offsetToLineCol(ctx.lineIndex, node.endIndex)];
	const intLeaf = { type: "LeafNode", kind: "Integer", value: suffix, source: suffixSource };
	return { type: "CompoundNode", op: "SlotSequence", children: [hashHashLeaf, intLeaf], source: nodeSource(node, ctx.lineIndex) };
}

// out: whole-node token: "%" → Token`Percent, "%%" or "%%..." → Token`PercentPercent, "%n" → CompoundNode(Out)
function adaptOut(node, ctx) {
	const text = ctx.source.slice(node.startIndex, node.endIndex);
	if (text === "%") return { type: "LeafNode", kind: "Token`Percent", value: "%", source: nodeSource(node, ctx.lineIndex) };
	if (/^%%+$/.test(text)) return { type: "LeafNode", kind: "Token`PercentPercent", value: text, source: nodeSource(node, ctx.lineIndex) };
	// %n form
	const percentSource = [offsetToLineCol(ctx.lineIndex, node.startIndex), offsetToLineCol(ctx.lineIndex, node.startIndex + 1)];
	const nSource = [offsetToLineCol(ctx.lineIndex, node.startIndex + 1), offsetToLineCol(ctx.lineIndex, node.endIndex)];
	const percentLeaf = { type: "LeafNode", kind: "Token`Percent", value: "%", source: percentSource };
	const nLeaf = { type: "LeafNode", kind: "Integer", value: text.slice(1), source: nSource };
	return { type: "CompoundNode", op: "Out", children: [percentLeaf, nLeaf], source: nodeSource(node, ctx.lineIndex) };
}

// message_name: lhs :: tag — emit InfixNode(MessageName, [lhs, Token`ColonColon, LeafNode(String, tag)])
// Note: token.immediate() in the grammar makes the tag text part of the node range but NOT a separate child.
// We extract the tag text by slicing from the end of the "::" token to the end of the node.
function adaptMessageName(node, ctx) {
	const named = [], unnamed = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		(c.isNamed ? named : unnamed).push(c);
	}
	// named[0] = LHS expression; unnamed[0] = "::" token
	const lhs = adaptNode(named[0], ctx);
	const colonColonToken = unnamed[0]; // the "::" token
	const colonColonLeaf = { type: "LeafNode", kind: "Token`ColonColon", value: "::", source: nodeSource(colonColonToken, ctx.lineIndex) };
	// The tag name text sits between end of "::" and end of message_name node
	const tagStart = colonColonToken.endIndex;
	const tagEnd = node.endIndex;
	const tagText = ctx.source.slice(tagStart, tagEnd);
	const tagSource = [offsetToLineCol(ctx.lineIndex, tagStart), offsetToLineCol(ctx.lineIndex, tagEnd)];
	const tagLeaf = { type: "LeafNode", kind: "String", value: tagText, source: tagSource };
	// Preserve any comment that sits between the LHS and "::" (threaded as trivia).
	const between = triviaLeaves(named[0].endIndex, colonColonToken.startIndex, ctx);
	return { type: "InfixNode", op: "MessageName", children: [lhs, ...between, colonColonLeaf, tagLeaf], source: nodeSource(node, ctx.lineIndex) };
}

// get: << expr — emit PrefixNode(Get, [Token`LessLess, expr])
// Iterate in source order so any comment between "<<" and the operand survives.
function adaptGet(node, ctx) {
	return { type: "PrefixNode", op: "Get", children: adaptChildrenInOrder(node, ctx), source: nodeSource(node, ctx.lineIndex) };
}

// put: lhs >> rhs or lhs >>> rhs — emit BinaryNode(Put/PutAppend, [lhs, op, rhs])
// Iterate in source order so comments between operands/operator survive.
function adaptPut(node, ctx) {
	const { tokens } = parts(node);
	const opText = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	const op = opText === ">>>" ? "PutAppend" : "Put";
	return {
		type: "BinaryNode",
		op,
		children: adaptChildrenInOrder(node, ctx),
		source: nodeSource(node, ctx.lineIndex),
	};
}

// tilde_infix: a ~ f ~ b — emit TernaryNode(TernaryTilde, [a, Token`Tilde, f, Token`Tilde, b])
// Comments between operands and tilde tokens are preserved in source order.
function adaptTildeInfix(node, ctx) {
	const children = adaptChildrenInOrder(node, ctx);
	return { type: "TernaryNode", op: "TernaryTilde", children, source: nodeSource(node, ctx.lineIndex) };
}

// span: ;; with optional LHS and RHS
// Forms: a ;; b, a ;;, ;; b, ;; (bare)
//
// Operands are the named children that aren't comments. Comments are named
// "extras" the grammar threads between the operands; they must be kept in the
// children (so the printer can preserve them) AND excluded from the operand
// count — counting a comment as an operand previously matched none of the
// arity branches and collapsed `a ;; (* c *) b` to the implicit `1 ;; All`.
// The 3-part form a ;; b ;; c nests as span(a, span(b, c)), so a single span
// node has at most two operands.
function adaptSpan(node, ctx) {
	const operands = [];
	let semiSemiToken = null;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) {
			if (semiSemiToken === null && ctx.source.slice(c.startIndex, c.endIndex) === ";;") {
				semiSemiToken = c;
			}
		} else if (c.type !== "comment") {
			operands.push(c);
		}
	}

	// Classify the (at most two) operands as LHS/RHS by position around ";;".
	let lhsNode = null, rhsNode = null;
	if (operands.length >= 2) {
		lhsNode = operands[0];
		rhsNode = operands[1];
	} else if (operands.length === 1) {
		if (operands[0].startIndex < semiSemiToken.startIndex) lhsNode = operands[0];
		else rhsNode = operands[0];
	}

	const implicitBound = (kind, value) => ({
		type: "LeafNode", kind, value, source: nodeSource(semiSemiToken, ctx.lineIndex),
	});

	// Emit children in source order, threading comments and whitespace trivia.
	// Absent operands are filled with the implicit Span bounds (1 / All) at the
	// ";;" boundary, preserving prior output for comment-free spans.
	const children = [];
	let lastEndIndex = node.startIndex;
	let emittedSemi = false;
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		for (const t of triviaLeaves(lastEndIndex, c.startIndex, ctx)) children.push(t);
		if (!emittedSemi && !c.isNamed && ctx.source.slice(c.startIndex, c.endIndex) === ";;") {
			if (lhsNode === null) children.push(implicitBound("Integer", "1"));
			children.push({ type: "LeafNode", kind: "Token`SemiSemi", value: ";;", source: nodeSource(c, ctx.lineIndex) });
			if (rhsNode === null) children.push(implicitBound("Symbol", "All"));
			emittedSemi = true;
		} else if (c.type === "comment") {
			children.push(leaf(c, ctx));
		} else if (c.isNamed) {
			children.push(adaptNode(c, ctx));
		}
		lastEndIndex = c.endIndex;
	}

	return {
		type: "BinaryNode",
		op: "Span",
		children,
		source: nodeSource(node, ctx.lineIndex),
	};
}

export { adaptNode, namedChildren, leaf };

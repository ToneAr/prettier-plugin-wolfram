const TRIVIA = new Set(["Whitespace", "Token`Whitespace", "Newline", "Token`Newline"]);

export function stripTrivia(node) {
	if (!node || typeof node !== "object") return node;
	const copy = { ...node };
	delete copy.locStart; delete copy.locEnd; // offsets are derived downstream
	if (Array.isArray(copy.children)) {
		copy.children = copy.children
			.filter((c) => !(c?.type === "LeafNode" && TRIVIA.has(c.kind)))
			.map(stripTrivia);
	}
	if (copy.head) copy.head = stripTrivia(copy.head);
	return copy;
}

export function cstEqualModuloTrivia(a, b) {
	return JSON.stringify(stripTrivia(a)) === JSON.stringify(stripTrivia(b));
}

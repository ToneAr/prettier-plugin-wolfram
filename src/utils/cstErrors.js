const CST_ERROR_SYMBOL_PATTERN =
	/(?:^|`)(?:AbstractSyntaxErrorNode|SyntaxErrorNode|\w*ErrorNode|\w*Missing\w*Node|\w*Unterminated\w*Node|\w*Incomplete\w*Node|\w*Issue)\[/;

function looksLikeCstErrorSymbol(value) {
	return typeof value === "string" && CST_ERROR_SYMBOL_PATTERN.test(value);
}

export function isCstErrorNode(node) {
	if (!node || typeof node !== "object" || node.type !== "Unknown") {
		return false;
	}

	return (
		looksLikeCstErrorSymbol(node.kind) || looksLikeCstErrorSymbol(node.wl)
	);
}

export function containsCstErrors(node) {
	if (!node || typeof node !== "object") return false;
	if (isCstErrorNode(node)) return true;
	if (containsCstErrors(node.head)) return true;

	return Array.isArray(node.children) && node.children.some(containsCstErrors);
}

export function createUnformattableNode(sourceText = "") {
	return {
		type: "UnformattableNode",
		children: [],
		locStart: 0,
		locEnd: sourceText.length,
		wl: sourceText,
	};
}

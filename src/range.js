function isIgnorableTopLevelChild(node) {
	return (
		node?.type === "LeafNode" &&
		["Token`Whitespace", "Token`Newline"].includes(node.kind)
	);
}

function findLastIndex(values, predicate) {
	for (let index = values.length - 1; index >= 0; index -= 1) {
		if (predicate(values[index], index)) {
			return index;
		}
	}

	return -1;
}

export function getFormattableTopLevelChildren(ast) {
	const children = Array.isArray(ast?.children) ? ast.children : [];

	return children.filter(
		(node) =>
			!isIgnorableTopLevelChild(node) &&
			typeof node.locStart === "number" &&
			typeof node.locEnd === "number",
	);
}

export function snapRangeToTopLevelChildren(ast, rangeStart, rangeEnd) {
	if (ast?.type === "UnformattableNode") {
		return null;
	}

	if (
		typeof rangeStart !== "number" ||
		typeof rangeEnd !== "number" ||
		!Number.isFinite(rangeStart) ||
		!Number.isFinite(rangeEnd) ||
		rangeStart >= rangeEnd
	) {
		return null;
	}

	const children = getFormattableTopLevelChildren(ast);
	if (children.length === 0) {
		return null;
	}

	let startIndex = children.findIndex((child) => child.locEnd > rangeStart);
	if (startIndex === -1) {
		startIndex = 0;
	}

	let endIndex = findLastIndex(
		children,
		(child) => child.locStart < rangeEnd,
	);
	if (endIndex === -1) {
		endIndex = children.length - 1;
	}

	if (endIndex < startIndex) {
		endIndex = startIndex;
	}

	return {
		children,
		startIndex,
		endIndex,
		rangeStart: children[startIndex].locStart,
		rangeEnd: children[endIndex].locEnd,
	};
}

export function preprocessRange(ast, opts) {
	if (!ast || ast.type === "UnformattableNode") {
		return ast;
	}

	if (!opts || (opts.rangeStart === 0 && opts.rangeEnd === Infinity)) {
		return ast;
	}

	const snappedRange = snapRangeToTopLevelChildren(
		ast,
		opts.rangeStart,
		opts.rangeEnd,
	);

	if (!snappedRange) {
		return ast;
	}

	opts.rangeStart = snappedRange.rangeStart;
	opts.rangeEnd = snappedRange.rangeEnd;

	return ast;
}

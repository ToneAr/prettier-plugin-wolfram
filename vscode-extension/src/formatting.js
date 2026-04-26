"use strict";

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

function getFormattableTopLevelChildren(ast) {
	const children = Array.isArray(ast?.children) ? ast.children : [];

	return children.filter(
		(node) =>
			!isIgnorableTopLevelChild(node) &&
			typeof node.locStart === "number" &&
			typeof node.locEnd === "number",
	);
}

function snapRangeToTopLevelChildren(ast, rangeStart, rangeEnd) {
	if (ast?.type === "UnformattableNode") return null;

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
	if (children.length === 0) return null;

	let startIndex = children.findIndex((child) => child.locEnd > rangeStart);
	if (startIndex === -1) startIndex = 0;

	let endIndex = findLastIndex(
		children,
		(child) => child.locStart < rangeEnd,
	);
	if (endIndex === -1) endIndex = children.length - 1;
	if (endIndex < startIndex) endIndex = startIndex;

	return {
		children,
		startIndex,
		endIndex,
		rangeStart: children[startIndex].locStart,
		rangeEnd: children[endIndex].locEnd,
	};
}

function sliceForSelection(children, startIndex, endIndex, textLength) {
	const replaceStart = startIndex === 0 ? 0 : children[startIndex - 1].locEnd;
	const replaceEnd =
		endIndex === children.length - 1
			? textLength
			: children[endIndex + 1].locStart;

	return { replaceStart, replaceEnd };
}

async function getWolframParse(pluginModule) {
	const plugin = pluginModule?.default ?? pluginModule;
	const parse = plugin?.parsers?.wolfram?.parse;

	if (typeof parse !== "function") {
		throw new Error(
			"Could not load the Wolfram parser from the resolved plugin.",
		);
	}

	return parse;
}

function createFormatOptions(filePath, resolvedConfig, plugins) {
	return {
		...resolvedConfig,
		filepath: filePath,
		parser: "wolfram",
		plugins,
	};
}

async function buildFormattingEditPlan({
	text,
	filePath,
	range,
	prettier,
	resolvedConfig,
	plugins,
	pluginModule,
	positionToOffset,
}) {
	const options = createFormatOptions(filePath, resolvedConfig, plugins);
	const formattedText = await prettier.format(text, options);

	if (formattedText === text) {
		return null;
	}

	if (!range) {
		return {
			replaceStart: 0,
			replaceEnd: text.length,
			replacementText: formattedText,
		};
	}

	const parse = await getWolframParse(pluginModule);
	const selection = snapRangeToTopLevelChildren(
		await parse(text, options),
		positionToOffset(range.start),
		positionToOffset(range.end),
	);

	if (!selection) {
		return null;
	}

	const originalSlice = sliceForSelection(
		selection.children,
		selection.startIndex,
		selection.endIndex,
		text.length,
	);

	const formattedChildren = getFormattableTopLevelChildren(
		await parse(formattedText, options),
	);

	if (formattedChildren.length <= selection.endIndex) {
		return {
			replaceStart: 0,
			replaceEnd: text.length,
			replacementText: formattedText,
		};
	}

	const formattedSlice = sliceForSelection(
		formattedChildren,
		selection.startIndex,
		selection.endIndex,
		formattedText.length,
	);

	const replacementText = formattedText.slice(
		formattedSlice.replaceStart,
		formattedSlice.replaceEnd,
	);

	if (
		replacementText ===
		text.slice(originalSlice.replaceStart, originalSlice.replaceEnd)
	) {
		return null;
	}

	return {
		replaceStart: originalSlice.replaceStart,
		replaceEnd: originalSlice.replaceEnd,
		replacementText,
	};
}

module.exports = {
	buildFormattingEditPlan,
	__test__: {
		getFormattableTopLevelChildren,
		snapRangeToTopLevelChildren,
		sliceForSelection,
	},
};

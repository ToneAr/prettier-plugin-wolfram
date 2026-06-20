import { doc } from "prettier";
import { isComment } from "./nodes/leaf.js";
import { sourceLineGap } from "./sourceLines.js";

const { hardline } = doc.builders;

function sourceTextBetween(leftNode, rightNode, options) {
	if (
		typeof options?.originalText !== "string" ||
		typeof leftNode?.locEnd !== "number" ||
		typeof rightNode?.locStart !== "number" ||
		leftNode.locEnd > rightNode.locStart
	) {
		return null;
	}

	return options.originalText.slice(leftNode.locEnd, rightNode.locStart);
}

function sourceColumnsTouch(leftNode, rightNode) {
	const leftEnd = leftNode?.source?.[1];
	const rightStart = rightNode?.source?.[0];
	if (!Array.isArray(leftEnd) || !Array.isArray(rightStart)) return false;
	return leftEnd[0] === rightStart[0] && leftEnd[1] === rightStart[1];
}

function areTightAdjacentComments(leftNode, rightNode, options) {
	if (!isComment(leftNode) || !isComment(rightNode)) return false;

	const between = sourceTextBetween(leftNode, rightNode, options);
	if (between != null) return between === "";

	return sourceColumnsTouch(leftNode, rightNode);
}

export function sameLineCommentSeparator(leftNode, rightNode, options) {
	return areTightAdjacentComments(leftNode, rightNode, options) ? "" : " ";
}

export function commentBoundarySeparator(
	leftNode,
	rightNode,
	options,
	fallback,
) {
	if (!rightNode) return "";
	const gap = sourceLineGap(leftNode, rightNode, options);
	if (gap === 0) return sameLineCommentSeparator(leftNode, rightNode, options);
	if (gap > 0) return hardline;
	return fallback;
}

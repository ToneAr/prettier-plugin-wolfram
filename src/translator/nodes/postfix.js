// src/translator/nodes/postfix.js
import { isTrivia } from "./leaf.js";
import {
	hasImmediateComment,
	printOriginalSource,
} from "../sourcePreservation.js";

const OP_DISPLAY = {
	Function: "&",
	Increment: "++",
	Decrement: "--",
	Factorial: "!",
	Factorial2: "!!",
};

export function printPostfix(node, options, print) {
	if (hasImmediateComment(node)) {
		return printOriginalSource(node, options);
	}

	const semantic = node.children.filter((c) => !isTrivia(c));
	if (semantic.length < 2) {
		return printOriginalSource(node, options);
	}
	const opStr =
		semantic[semantic.length - 1]?.value ?? OP_DISPLAY[node.op] ?? node.op;
	const operand = semantic[0];
	return [print(operand), opStr];
}

// src/translator/index.js
import { printLeaf } from "./nodes/leaf.js";
import { printContainer } from "./nodes/container.js";
import { printCall } from "./nodes/call.js";
import { printInfix } from "./nodes/infix.js";
import { printBinary } from "./nodes/binary.js";
import { printPrefix } from "./nodes/prefix.js";
import { printPostfix } from "./nodes/postfix.js";
import { printCompound } from "./nodes/compound.js";
import { printGroup } from "./nodes/group.js";
import { printTernary } from "./nodes/ternary.js";
import { getSpecialPrinter } from "./specialForms.js";
import { printOriginalSource } from "./sourcePreservation.js";

/**
 * prettier's print function — called as path.call(print, ...) by prettier core.
 * `path` is a FastPath; `path.getValue()` returns the current node.
 */
export function printNode(path, options, print) {
	const node = path.getValue();
	if (!node) return "";

	switch (node.type) {
		case "ContainerNode":
			return printContainer(node, options, (child) => {
				return path.call(
					print,
					"children",
					node.children.indexOf(child),
				);
			});

		case "LeafNode":
			return printLeaf(node, options, { path });

		case "CallNode": {
			const special = getSpecialPrinter(node, options);
			if (special) return special(path, options, print, node);
			return printCall(path, options, print, node);
		}

		case "InfixNode":
			return printInfix(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		case "BinaryNode":
			return printBinary(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		case "PrefixNode":
			return printPrefix(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		case "PostfixNode":
			return printPostfix(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		case "CompoundNode":
			return printCompound(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		case "GroupNode":
			return printGroup(path, options, print, node);

		case "TernaryNode":
			return printTernary(node, options, (child) =>
				path.call(print, "children", node.children.indexOf(child)),
			);

		default:
			// Unsupported CST nodes should round-trip the original source instead
			// of exposing raw CodeParser internals in formatter output.
			return printOriginalSource(node, options);
	}
}

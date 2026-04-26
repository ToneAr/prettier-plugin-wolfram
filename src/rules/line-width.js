// src/rules/line-width.js

export default {
	name: "line-width",
	description: "Line exceeds configured printWidth",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		if (node.type !== "ContainerNode") return;

		const maxWidth = context.options?.printWidth ?? 80;
		const sourceText = String(context.options?.__sourceText ?? "");
		const overflows = lineOverflowRangesIgnoringComments(
			sourceText,
			maxWidth,
		);

		for (const overflow of overflows) {
			context.report({
				node: {
					source: [
						[overflow.line, overflow.startCol],
						[overflow.line, overflow.endCol],
					],
				},
				message: `Line exceeds printWidth (${maxWidth}).`,
			});
		}
	},
};

function lineOverflowRangesIgnoringComments(sourceText, maxWidth) {
	const overflows = [];
	let line = 1;
	let rawCol = 1;
	let commentDepth = 0;
	let inString = false;
	let escape = false;
	let keptChars = [];
	let keptCols = [];

	const flushLine = () => {
		let visibleLength = keptChars.length;
		while (
			visibleLength > 0 &&
			/[ \t]/.test(keptChars[visibleLength - 1])
		) {
			visibleLength--;
		}

		if (visibleLength > maxWidth) {
			overflows.push({
				line,
				startCol: keptCols[maxWidth],
				endCol: keptCols[visibleLength - 1] + 1,
			});
		}

		keptChars = [];
		keptCols = [];
		line++;
		rawCol = 1;
	};

	for (let i = 0; i < sourceText.length; i++) {
		const ch = sourceText[i];
		const next = sourceText[i + 1];

		if (ch === "\r") continue;
		if (ch === "\n") {
			flushLine();
			continue;
		}

		if (commentDepth > 0) {
			if (ch === "(" && next === "*") {
				commentDepth++;
				rawCol += 2;
				i++;
				continue;
			}
			if (ch === "*" && next === ")") {
				commentDepth--;
				rawCol += 2;
				i++;
				continue;
			}
			rawCol++;
			continue;
		}

		if (inString) {
			keptChars.push(ch);
			keptCols.push(rawCol);
			if (escape) {
				escape = false;
			} else if (ch === "\\") {
				escape = true;
			} else if (ch === '"') {
				inString = false;
			}
			rawCol++;
			continue;
		}

		if (ch === '"') {
			inString = true;
			keptChars.push(ch);
			keptCols.push(rawCol);
			rawCol++;
			continue;
		}

		if (ch === "(" && next === "*") {
			commentDepth++;
			rawCol += 2;
			i++;
			continue;
		}

		keptChars.push(ch);
		keptCols.push(rawCol);
		rawCol++;
	}

	flushLine();
	return overflows;
}

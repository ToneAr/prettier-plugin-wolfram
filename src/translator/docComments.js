import { doc } from "prettier";
import { normalizeWolframOptions } from "../options.js";
import { sameLineCommentSeparator } from "./commentSpacing.js";

export function joinDocsWithSpace(docs) {
	const nonEmptyDocs = docs.filter(
		(docNode) => docNode !== "" && docNode != null,
	);
	if (nonEmptyDocs.length === 0) return "";

	const joined = [nonEmptyDocs[0]];
	for (let i = 1; i < nonEmptyDocs.length; i++) {
		joined.push(" ", nonEmptyDocs[i]);
	}
	return joined;
}

export function isDocumentationCommentMarkerText(text) {
	return /^\(\*\s*</u.test(String(text ?? ""));
}

function documentationCommentMarkersEnabled(options) {
	return (
		normalizeWolframOptions(options).wolframDocumentationCommentMarkers ===
		true
	);
}

export function hasDocumentationCommentMarker(comment, options) {
	if (!documentationCommentMarkersEnabled(options)) return false;
	const node = comment?.node ?? comment;
	return (
		node?.kind === "Token`Comment" &&
		isDocumentationCommentMarkerText(node.value)
	);
}

function hasMarkedDocumentationCommentEntry(entry, options) {
	return (entry?.trailingComments ?? []).some((comment) =>
		hasDocumentationCommentMarker(comment, options),
	);
}

function normalizeDocumentationCommentMarker(text) {
	return String(text).replace(/^\(\*\s*<\s*/u, "(* < ");
}

function normalizedCommentDoc(comment, options) {
	const rendered = renderFlatDoc(comment.doc, options);
	if (
		!documentationCommentMarkersEnabled(options) ||
		!isDocumentationCommentMarkerText(rendered) ||
		rendered.includes("\n")
	) {
		return comment.doc;
	}
	return normalizeDocumentationCommentMarker(rendered);
}

export function joinCommentDocs(comments, options) {
	const nonEmptyComments = comments.filter(
		(comment) => comment?.doc !== "" && comment?.doc != null,
	);
	if (nonEmptyComments.length === 0) return "";

	const joined = [normalizedCommentDoc(nonEmptyComments[0], options)];
	for (let i = 1; i < nonEmptyComments.length; i++) {
		joined.push(
			sameLineCommentSeparator(
				nonEmptyComments[i - 1].node,
				nonEmptyComments[i].node,
				options,
			),
			normalizedCommentDoc(nonEmptyComments[i], options),
		);
	}
	return joined;
}

export function renderFlatDoc(docNode, options) {
	const rendered = doc.printer.printDocToString(docNode, {
		printWidth: 100000,
		tabWidth: options.tabWidth ?? 2,
		useTabs: false,
		endOfLine: "lf",
	}).formatted;
	return rendered.endsWith("\n") ? rendered.slice(0, -1) : rendered;
}

export function documentationCommentColumn(
	entries,
	options,
	suffixForEntry = () => "",
) {
	options = normalizeWolframOptions(options);
	const manual = options.wolframDocumentationCommentColumn ?? 0;
	if (manual > 0) return manual;
	if (
		entries.some((entry) =>
			hasMarkedDocumentationCommentEntry(entry, options),
		)
	) {
		return options.printWidth ?? 80;
	}
	const padding = Math.max(
		1,
		options.wolframDocumentationCommentPadding ?? 2,
	);

	let maxCodeWidth = 0;
	for (const entry of entries) {
		if (!entry.trailingCommentDoc) continue;
		const rendered = renderFlatDoc(
			[entry.doc, suffixForEntry(entry)],
			options,
		);
		if (rendered.includes("\n")) continue;
		maxCodeWidth = Math.max(maxCodeWidth, rendered.length);
	}
	return maxCodeWidth + padding;
}

export function withAlignedTrailingComment(
	entry,
	options,
	column,
	suffix = "",
) {
	if (!entry.trailingCommentDoc) return [entry.doc, suffix];

	const rendered = renderFlatDoc([entry.doc, suffix], options);
	if (rendered.includes("\n")) {
		return [entry.doc, suffix, " ", entry.trailingCommentDoc];
	}

	const gap = Math.max(1, column - rendered.length);
	return [rendered, " ".repeat(gap), entry.trailingCommentDoc];
}

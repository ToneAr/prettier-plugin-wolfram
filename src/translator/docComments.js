import { doc } from 'prettier';

function lineWidth(options) {
  return options.printWidth ?? 80;
}

export function joinDocsWithSpace(docs) {
  const nonEmptyDocs = docs.filter((docNode) => docNode !== '' && docNode != null);
  if (nonEmptyDocs.length === 0) return '';

  const joined = [nonEmptyDocs[0]];
  for (let i = 1; i < nonEmptyDocs.length; i++) {
    joined.push(' ', nonEmptyDocs[i]);
  }
  return joined;
}

export function renderFlatDoc(docNode, options) {
  const rendered = doc.printer.printDocToString(docNode, {
    printWidth: 100000,
    tabWidth: options.tabWidth ?? 2,
    useTabs: false,
    endOfLine: 'lf',
  }).formatted;
  return rendered.endsWith('\n') ? rendered.slice(0, -1) : rendered;
}

export function documentationCommentColumn(entries, options, suffixForEntry = () => '') {
  const minColumn = lineWidth(options) + 1;
  const manual = options.wolframDocumentationCommentColumn ?? 0;
  if (manual > 0) return Math.max(manual, minColumn);
  const padding = Math.max(1, options.wolframDocumentationCommentPadding ?? 2);

  let maxCodeWidth = 0;
  for (const entry of entries) {
    if (!entry.trailingCommentDoc) continue;
    const rendered = renderFlatDoc([entry.doc, suffixForEntry(entry)], options);
    if (rendered.includes('\n')) continue;
    maxCodeWidth = Math.max(maxCodeWidth, rendered.length);
  }
  return Math.max(minColumn, maxCodeWidth + padding);
}

export function withAlignedTrailingComment(entry, options, column, suffix = '') {
  if (!entry.trailingCommentDoc) return [entry.doc, suffix];

  const rendered = renderFlatDoc([entry.doc, suffix], options);
  if (rendered.includes('\n')) {
    return [entry.doc, suffix, ' ', entry.trailingCommentDoc];
  }

  const gap = Math.max(1, column - rendered.length);
  return [rendered, ' '.repeat(gap), entry.trailingCommentDoc];
}

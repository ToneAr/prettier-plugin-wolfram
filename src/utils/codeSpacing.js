const DEFAULT_MAX_BLANK_LINES_BETWEEN_CODE = 1;
const DEFAULT_BLANK_LINES_BETWEEN_DEFINITIONS = 1;

const DECLARATION_OPS = new Set([
  'Set',
  'SetDelayed',
  'TagSet',
  'TagSetDelayed',
  'UpSet',
  'UpSetDelayed',
]);

export function nonNegativeIntegerOption(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

export function maxBlankLinesBetweenCode(options = {}) {
  return nonNegativeIntegerOption(
    options.wolframMaxBlankLinesBetweenCode,
    DEFAULT_MAX_BLANK_LINES_BETWEEN_CODE,
  );
}

export function blankLinesBetweenDefinitions(options = {}) {
  return nonNegativeIntegerOption(
    options.wolframNewlinesBetweenDefinitions,
    DEFAULT_BLANK_LINES_BETWEEN_DEFINITIONS,
  );
}

export function isDeclarationNode(node) {
  return node?.type === 'BinaryNode' && DECLARATION_OPS.has(node.op);
}

export function observedBlankLinesBetween(prevEndLine, nextStartLine) {
  if (!Number.isFinite(prevEndLine) || !Number.isFinite(nextStartLine)) {
    return 0;
  }

  return Math.max(0, nextStartLine - prevEndLine - 1);
}

export function blankLinesForCodeGap(
  prevNode,
  nextNode,
  observedBlankLines,
  options = {},
  { topLevel = false } = {},
) {
  const mode = options.wolframTopLevelSpacingMode ?? 'declarations';
  if (topLevel && mode === 'none') return 0;

  if (isDeclarationNode(prevNode) && isDeclarationNode(nextNode)) {
    return blankLinesBetweenDefinitions(options);
  }

  const maxBlankLines = maxBlankLinesBetweenCode(options);
  const cappedObserved = Math.min(
    maxBlankLines,
    nonNegativeIntegerOption(observedBlankLines, 0),
  );

  if (topLevel && mode === 'all') {
    return Math.min(maxBlankLines, Math.max(1, cappedObserved));
  }

  return cappedObserved;
}

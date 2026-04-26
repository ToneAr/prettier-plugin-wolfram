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

const TRIVIA_KINDS = new Set([
  'Token`Whitespace',
  'Whitespace',
  'Token`Newline',
  'Newline',
  'Token`LineContinuation',
  'LineContinuation',
  'Token`Fake`ImplicitNull',
]);

const SEMICOLON_KINDS = new Set(['Token`Semi', 'Token`Semicolon']);

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

function isTrivia(node) {
  return node?.type === 'LeafNode' && TRIVIA_KINDS.has(node.kind);
}

function isSemicolonToken(node) {
  return node?.type === 'LeafNode' && SEMICOLON_KINDS.has(node.kind);
}

function isComment(node) {
  return node?.type === 'LeafNode' && node.kind === 'Token`Comment';
}

function isSingleStatementCompound(node) {
  return (
    (node?.type === 'InfixNode' && node.op === 'CompoundExpression') ||
    (node?.type === 'CompoundNode' &&
      (node.op === 'CompoundExpression' || node.op === 'Semicolon'))
  );
}

export function unwrapSingleStatementNode(node) {
  if (!isSingleStatementCompound(node)) return node;

  const statements = (node.children ?? []).filter(
    (child) => !isTrivia(child) && !isSemicolonToken(child) && !isComment(child),
  );

  if (statements.length !== 1) return node;
  return unwrapSingleStatementNode(statements[0]);
}

export function isDeclarationNode(node) {
  const statement = unwrapSingleStatementNode(node);
  return statement?.type === 'BinaryNode' && DECLARATION_OPS.has(statement.op);
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

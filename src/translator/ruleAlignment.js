import { doc } from 'prettier';
import { renderFlatDoc } from './docComments.js';
import { isComment, isTrivia } from './nodes/leaf.js';
import { wantsSpacesAroundOperator } from '../utils/operatorSpacing.js';

const { ifBreak } = doc.builders;

const RULE_OPS = new Set(['Rule', 'RuleDelayed']);
const RULE_DISPLAY = {
  Rule: '->',
  RuleDelayed: ':>',
};

function isSemanticTokenLeaf(node) {
  return node?.type === 'LeafNode' && [
    'Token`Hash',
    'Token`HashHash',
    'Token`Under',
    'Token`UnderUnder',
    'Token`UnderUnderUnder',
  ].includes(node.kind);
}

function isFakeTokenLeaf(node) {
  return node?.type === 'LeafNode' && node.kind.startsWith('Token`Fake`');
}

function isOperatorTokenLeaf(node) {
  return node?.type === 'LeafNode' &&
    node.kind.startsWith('Token`') &&
    !isSemanticTokenLeaf(node) &&
    !isFakeTokenLeaf(node);
}

function ruleParts(node) {
  if (node?.type !== 'BinaryNode' || !RULE_OPS.has(node.op)) return null;
  if ((node.children ?? []).some((child) => isComment(child))) return null;

  const semantic = node.children.filter((child) =>
    !isTrivia(child) &&
    !(child.type === 'LeafNode' && child.kind.startsWith('Token`') && !isSemanticTokenLeaf(child))
  );
  const [lhs, rhs] = semantic;
  if (!lhs || !rhs) return null;

  const token = node.children.find((child) => !isTrivia(child) && isOperatorTokenLeaf(child));
  return {
    lhs,
    rhs,
    token,
    op: token?.value ?? RULE_DISPLAY[node.op],
  };
}

function childDoc(path, print, entry, child) {
  const childIndex = entry.node.children.indexOf(child);
  if (childIndex === -1 || !entry.path) return null;
  return path.call(print, ...entry.path, 'children', childIndex);
}

function alignmentCandidate(path, options, print, entry) {
  const parts = ruleParts(entry.node);
  if (!parts) return null;

  const lhsDoc = childDoc(path, print, entry, parts.lhs);
  const rhsDoc = childDoc(path, print, entry, parts.rhs);
  if (!lhsDoc || !rhsDoc) return null;

  const lhsText = renderFlatDoc(lhsDoc, options);
  if (lhsText.includes('\n')) return null;

  return {
    entry,
    lhsText,
    lhsWidth: lhsText.length,
    rhsDoc,
    op: parts.op,
    token: parts.token,
  };
}

export function withAlignedRuleValues(entries, path, options, print) {
  if (!options.wolframAlignRuleValues) return entries;

  const candidates = entries
    .map((entry) => alignmentCandidate(path, options, print, entry))
    .filter(Boolean);

  if (candidates.length < 2) return entries;

  const maxLhsWidth = Math.max(...candidates.map((candidate) => candidate.lhsWidth));
  for (const candidate of candidates) {
    const hasOperatorSpace = wantsSpacesAroundOperator(candidate.entry.node, options, candidate.token);
    const beforeOperator = maxLhsWidth - candidate.lhsWidth + (hasOperatorSpace ? 1 : 0);
    const afterOperator = hasOperatorSpace ? ' ' : '';
    candidate.entry.alignedRuleDoc = [
      candidate.lhsText,
      ' '.repeat(beforeOperator),
      candidate.op,
      afterOperator,
      candidate.rhsDoc,
    ];
  }

  return entries;
}

export function alignedRuleDoc(entry, groupId) {
  return entry.alignedRuleDoc
    ? ifBreak(entry.alignedRuleDoc, entry.doc, { groupId })
    : entry.doc;
}

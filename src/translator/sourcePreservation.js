import { isComment } from './nodes/leaf.js';

export function printOriginalSource(node, options) {
  if (
    typeof options?.originalText === 'string' &&
    typeof node?.locStart === 'number' &&
    typeof node?.locEnd === 'number' &&
    node.locEnd >= node.locStart
  ) {
    const source = options.originalText.slice(node.locStart, node.locEnd);
    if (source.length > 0) return source;
  }

  return node?.wl ?? '';
}

export function hasImmediateComment(node) {
  if (!node || typeof node !== 'object') return false;
  if (isComment(node)) return true;
  if (isComment(node.head)) return true;
  return (node.children ?? []).some((child) => isComment(child));
}

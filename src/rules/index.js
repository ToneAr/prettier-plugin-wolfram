// src/rules/index.js
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-discover rule modules by listing this directory
async function loadRules() {
  const files = readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && f !== 'index.js');
  const modules = await Promise.all(
    files.map(f => import(join(__dirname, f)))
  );
  return modules.map(m => m.default);
}

/**
 * Run all lint rules over a CST node tree.
 * Returns an array of diagnostics: { rule, message, node, level }.
 */
export async function runRules(rootNode, lintRuleOverrides = {}, options = {}) {
  const rules = await loadRules();
  const diagnostics = [];

  for (const rule of rules) {
    const level = lintRuleOverrides[rule.name] ?? rule.defaultLevel;
    if (level === 'off') continue;

    const context = {
      options,
      report({ node, message }) {
        diagnostics.push({
          rule: rule.name,
          message,
          node,
          level,
          fixableByFormatter: Boolean(rule.fixableByFormatter),
        });
      },
    };

    walkCST(rootNode, (node) => rule.visit(node, context));
  }

  return diagnostics;
}

function walkCST(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  if (node.children) node.children.forEach(c => walkCST(c, fn));
  if (node.head) walkCST(node.head, fn);
}

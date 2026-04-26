import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import prettier from 'prettier';
import * as plugin from '../../src/index.js';
import { options as optionDefinitions } from '../../src/options.js';
import { runRules } from '../../src/rules/index.js';

const defaultRuleOptions = Object.fromEntries(
  Object.entries(optionDefinitions).map(([name, config]) => [name, config.default]),
);

describe('formatted output lint invariants', () => {
  it('does not produce formatter-fixable findings on the formatted sample corpus', async () => {
    const corpusDir = path.resolve('tests/wl');
    const files = readdirSync(corpusDir)
      .filter((file) => file.endsWith('.wl'))
      .sort();

    const failures = [];

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const source = readFileSync(filePath, 'utf8');
      const formatted = await prettier.format(source, {
        parser: 'wolfram',
        plugins: [plugin],
        filepath: filePath,
      });
      const reformatted = await prettier.format(formatted, {
        parser: 'wolfram',
        plugins: [plugin],
        filepath: filePath,
      });
      const ast = await plugin.parsers.wolfram.parse(formatted, { tabWidth: 2 });
      const findings = await runRules(ast, {}, {
        ...defaultRuleOptions,
        printWidth: 80,
        tabWidth: 2,
        __sourceText: formatted,
      });
      const fixableFindings = findings.filter((finding) => finding.fixableByFormatter);

      if (formatted !== reformatted || fixableFindings.length > 0) {
        failures.push({
          file,
          idempotent: formatted === reformatted,
          findings: fixableFindings.map((finding) => ({
            rule: finding.rule,
            message: finding.message,
          })),
        });
      }
    }

    expect(failures).toEqual([]);
  }, 90000);
});

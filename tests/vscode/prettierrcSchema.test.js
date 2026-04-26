import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { options as optionDefinitions } from '../../src/options.js';

const schema = JSON.parse(
  readFileSync(path.resolve('vscode-extension/schemas/prettierrc.schema.json'), 'utf8'),
);
const extensionPackage = JSON.parse(
  readFileSync(path.resolve('vscode-extension/package.json'), 'utf8'),
);

const schemaTypeForOptionType = {
  boolean: 'boolean',
  int: 'integer',
  path: 'string',
  string: 'string',
};

describe('VS Code .prettierrc schema', () => {
  it('is contributed for JSON Prettier config files', () => {
    const validation = extensionPackage.contributes.jsonValidation.find(
      (entry) => entry.url === './schemas/prettierrc.schema.json',
    );

    expect(validation).toBeTruthy();
    expect(validation.fileMatch).toEqual(expect.arrayContaining([
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.json5',
    ]));
  });

  it('documents every Wolfram Prettier option', () => {
    for (const [name, option] of Object.entries(optionDefinitions)) {
      expect(schema.properties[name]).toMatchObject({
        type: schemaTypeForOptionType[option.type],
        default: option.default,
      });
      expect(schema.properties[name].markdownDescription).toBeTruthy();
    }
  });

  it('provides value completions for top-level spacing mode', () => {
    expect(schema.properties.wolframTopLevelSpacingMode.enum).toEqual([
      'declarations',
      'all',
      'none',
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  APPLY_DOCUMENT_FORMATTING_COMMAND,
  APPLY_RANGE_FORMATTING_COMMAND,
  provideFormattingCodeActions,
} from '../../vscode-extension/src/codeActions.js';

class FakeCodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
}

const vscodeApi = {
  CodeAction: FakeCodeAction,
  CodeActionKind: {
    QuickFix: 'quickfix',
  },
  DiagnosticSeverity: {
    Hint: 3,
  },
};

describe('provideFormattingCodeActions', () => {
  it('creates range and document quick fixes for formatter diagnostics', () => {
    const uri = { fsPath: '/tmp/test.wl' };
    const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } };
    const diagnostic = {
      source: 'prettier-wolfram:format',
      range,
      message: 'Formatting differs.',
    };

    const actions = provideFormattingCodeActions(
      vscodeApi,
      { uri },
      range,
      { diagnostics: [diagnostic] },
    );

    expect(actions).toHaveLength(2);
    expect(actions[0].command).toMatchObject({
      command: APPLY_RANGE_FORMATTING_COMMAND,
      arguments: [uri, range],
    });
    expect(actions[0].isPreferred).toBe(true);
    expect(actions[1].command).toMatchObject({
      command: APPLY_DOCUMENT_FORMATTING_COMMAND,
      arguments: [uri],
    });
  });

  it('ignores diagnostics from other sources', () => {
    const actions = provideFormattingCodeActions(
      vscodeApi,
      { uri: { fsPath: '/tmp/test.wl' } },
      null,
      {
        diagnostics: [
          {
            source: 'eslint',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          },
        ],
      },
    );

    expect(actions).toEqual([]);
  });

  it('accepts formatter hint diagnostics for quick fixes', () => {
    const uri = { fsPath: '/tmp/test.wl' };
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } };
    const actions = provideFormattingCodeActions(
      vscodeApi,
      { uri },
      range,
      {
        diagnostics: [
          {
            source: 'prettier-wolfram:format',
            severity: vscodeApi.DiagnosticSeverity.Hint,
            range,
          },
        ],
      },
    );

    expect(actions).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIAGNOSTIC_SEVERITY,
  diagnosticSeverityFromConfig,
  normalizeDiagnosticSeverity,
} from '../../vscode-extension/src/diagnosticSeverity.js';

const vscodeApi = {
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
};

describe('diagnostic severity config', () => {
  it('defaults to information severity', () => {
    expect(DEFAULT_DIAGNOSTIC_SEVERITY).toBe('information');
    expect(diagnosticSeverityFromConfig(vscodeApi, undefined)).toBe(
      vscodeApi.DiagnosticSeverity.Information,
    );
  });

  it('normalizes valid severity values', () => {
    expect(normalizeDiagnosticSeverity('warning')).toBe('warning');
    expect(normalizeDiagnosticSeverity('Hint')).toBe('hint');
    expect(normalizeDiagnosticSeverity('ERROR')).toBe('error');
  });

  it('falls back to information on invalid severity values', () => {
    expect(normalizeDiagnosticSeverity('banana')).toBe('information');
    expect(diagnosticSeverityFromConfig(vscodeApi, 'banana')).toBe(
      vscodeApi.DiagnosticSeverity.Information,
    );
  });
});

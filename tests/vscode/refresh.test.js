import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleDiagnostics } from '../../vscode-extension/src/diagnosticRefresh.js';

describe('diagnostic refresh scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('clears stale diagnostics immediately when content changes', () => {
    const document = {
      languageId: 'wolfram',
      uri: {
        scheme: 'file',
        toString: () => 'file:///tmp/test.wl',
      },
    };
    const collection = {
      set: vi.fn(),
    };
    const refreshTimers = new Map();
    const refreshGenerations = new Map();
    const activeDiagnostics = new Map();
    const pendingDiagnostics = new Map();

    scheduleDiagnostics({
      document,
      collection,
      refreshTimers,
      refreshGenerations,
      activeDiagnostics,
      pendingDiagnostics,
      delay: 200,
      clearExisting: true,
      collectDiagnostics: vi.fn(async () => {}),
    });

    expect(collection.set).toHaveBeenCalledWith(document.uri, []);
  });

  it('does not clear diagnostics eagerly when requested not to', () => {
    const document = {
      languageId: 'wolfram',
      uri: {
        scheme: 'file',
        toString: () => 'file:///tmp/test-2.wl',
      },
    };
    const collection = {
      set: vi.fn(),
    };
    const refreshTimers = new Map();
    const refreshGenerations = new Map();
    const activeDiagnostics = new Map();
    const pendingDiagnostics = new Map();

    scheduleDiagnostics({
      document,
      collection,
      refreshTimers,
      refreshGenerations,
      activeDiagnostics,
      pendingDiagnostics,
      delay: 200,
      collectDiagnostics: vi.fn(async () => {}),
    });

    expect(collection.set).not.toHaveBeenCalled();
  });

  it('coalesces new diagnostics while one is already active', async () => {
    const document = {
      languageId: 'wolfram',
      uri: {
        scheme: 'file',
        toString: () => 'file:///tmp/test-3.wl',
      },
    };
    const nextDocument = {
      ...document,
      version: 2,
    };
    const collection = {
      set: vi.fn(),
    };
    const refreshTimers = new Map();
    const refreshGenerations = new Map();
    const activeDiagnostics = new Map();
    const pendingDiagnostics = new Map();

    let releaseActive;
    const collectDiagnostics = vi.fn(() => new Promise((resolve) => {
      releaseActive = resolve;
    }));

    scheduleDiagnostics({
      document,
      collection,
      refreshTimers,
      refreshGenerations,
      activeDiagnostics,
      pendingDiagnostics,
      delay: 0,
      collectDiagnostics,
    });
    await vi.runAllTimersAsync();
    expect(collectDiagnostics).toHaveBeenCalledTimes(1);

    scheduleDiagnostics({
      document: nextDocument,
      collection,
      refreshTimers,
      refreshGenerations,
      activeDiagnostics,
      pendingDiagnostics,
      delay: 0,
      clearExisting: true,
      collectDiagnostics,
    });

    expect(collectDiagnostics).toHaveBeenCalledTimes(1);
    expect(pendingDiagnostics.has(document.uri.toString())).toBe(true);

    releaseActive();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(collectDiagnostics).toHaveBeenCalledTimes(2);
  });
});

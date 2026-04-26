'use strict';

function normalizeResolvedConfig(resolvedConfig = {}) {
  return { ...resolvedConfig };
}

function mergeConfiguredPlugins(resolvedConfig, pluginPath) {
  const configuredPlugins = Array.isArray(resolvedConfig?.plugins)
    ? resolvedConfig.plugins
    : [];
  const merged = [];

  for (const plugin of [...configuredPlugins, pluginPath]) {
    if (!plugin) continue;
    if (merged.some((existing) => existing === plugin)) continue;
    merged.push(plugin);
  }

  return merged;
}

async function resolveProjectConfig(prettier, filePath) {
  const resolvedConfig = await prettier.resolveConfig(filePath, {
    editorconfig: true,
    useCache: false,
  }) ?? {};

  return normalizeResolvedConfig(resolvedConfig);
}

module.exports = {
  mergeConfiguredPlugins,
  normalizeResolvedConfig,
  resolveProjectConfig,
};

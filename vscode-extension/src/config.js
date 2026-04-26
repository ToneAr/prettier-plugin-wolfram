"use strict";

const WOLFRAM_PLUGIN_PACKAGE_NAMES = new Set([
	"@wrel/prettier-plugin-wolfram",
	"prettier-plugin-wolfram",
]);

function normalizeResolvedConfig(resolvedConfig = {}) {
	return { ...resolvedConfig };
}

function isConfiguredWolframPlugin(plugin) {
	return (
		typeof plugin === "string" && WOLFRAM_PLUGIN_PACKAGE_NAMES.has(plugin)
	);
}

function mergeConfiguredPlugins(resolvedConfig, pluginPath) {
	const configuredPlugins = Array.isArray(resolvedConfig?.plugins)
		? resolvedConfig.plugins
		: [];
	const merged = [];

	for (const plugin of [
		...configuredPlugins.filter(
			(plugin) => !isConfiguredWolframPlugin(plugin),
		),
		pluginPath,
	]) {
		if (!plugin) continue;
		if (merged.some((existing) => existing === plugin)) continue;
		merged.push(plugin);
	}

	return merged;
}

async function resolveProjectConfig(prettier, filePath) {
	const resolvedConfig =
		(await prettier.resolveConfig(filePath, {
			editorconfig: true,
			useCache: false,
		})) ?? {};

	return normalizeResolvedConfig(resolvedConfig);
}

module.exports = {
	mergeConfiguredPlugins,
	normalizeResolvedConfig,
	resolveProjectConfig,
};

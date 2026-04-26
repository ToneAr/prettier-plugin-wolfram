"use strict";

const DEFAULT_DIAGNOSTIC_SEVERITY = "information";

function normalizeDiagnosticSeverity(value) {
	if (typeof value !== "string") return DEFAULT_DIAGNOSTIC_SEVERITY;

	switch (value.toLowerCase()) {
		case "hint":
		case "information":
		case "warning":
		case "error":
			return value.toLowerCase();
		default:
			return DEFAULT_DIAGNOSTIC_SEVERITY;
	}
}

function diagnosticSeverityFromConfig(vscodeApi, value) {
	const normalized = normalizeDiagnosticSeverity(value);
	const severities = vscodeApi?.DiagnosticSeverity ?? {};

	return (
		severities[normalized[0].toUpperCase() + normalized.slice(1)] ??
		severities.Information
	);
}

module.exports = {
	DEFAULT_DIAGNOSTIC_SEVERITY,
	diagnosticSeverityFromConfig,
	normalizeDiagnosticSeverity,
};

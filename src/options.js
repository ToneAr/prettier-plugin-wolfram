// src/options.js
function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value)
	);
}

function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function wolframOptionDefinition(definition) {
	return {
		type: definition.type,
		category: "Wolfram",
		...(hasOwn(definition, "exception")
			? { exception: definition.exception }
			: {}),
		...(hasOwn(definition, "default")
			? { default: definition.default }
			: {}),
		description: definition.description,
	};
}

function isBlankLineRange(value) {
	return (
		isPlainObject(value) &&
		Number.isInteger(value.min) &&
		Number.isInteger(value.max) &&
		value.min >= 0 &&
		value.max >= value.min
	);
}

function blankLineRangeOption(defaultValue, description) {
	return {
		type: "int",
		...(defaultValue == null ? {} : { default: defaultValue }),
		exception: (value) =>
			(Number.isInteger(value) && value >= 0) || isBlankLineRange(value),
		description,
	};
}

export const wolframOptions = {
	newlinesBetweenDefinitions: {
		...blankLineRangeOption(
			{ min: 1, max: 1 },
			"Allowed blank lines between adjacent definitions.",
		),
		legacyName: "wolframNewlinesBetweenDefinitions",
	},
	newlinesBetweenSetDefinitions: {
		...blankLineRangeOption(
			null,
			"Allowed blank lines between adjacent Set-family definitions. Inherits newlinesBetweenDefinitions when unset.",
		),
		legacyName: "wolframNewlinesBetweenSetDefinitions",
	},
	newlinesBetweenSetDelayedDefinitions: {
		...blankLineRangeOption(
			null,
			"Allowed blank lines between adjacent SetDelayed-family definitions. Inherits newlinesBetweenDefinitions when unset.",
		),
		legacyName: "wolframNewlinesBetweenSetDelayedDefinitions",
	},
	newlinesBetweenSetAndSetDelayedDefinitions: {
		...blankLineRangeOption(
			null,
			"Allowed blank lines between mixed Set-family and SetDelayed-family definitions. Inherits newlinesBetweenDefinitions when unset.",
		),
		legacyName: "wolframNewlinesBetweenSetAndSetDelayedDefinitions",
	},
	newlinesBetweenSameNameDefinitions: {
		...blankLineRangeOption(
			{ min: 0, max: 0 },
			"Allowed blank lines between adjacent definitions that belong to the same symbol.",
		),
		legacyName: "wolframNewlinesBetweenSameNameDefinitions",
	},
	maxBlankLinesBetweenCode: {
		type: "int",
		default: 1,
		minimum: 0,
		legacyName: "wolframMaxBlankLinesBetweenCode",
		description:
			"Maximum source blank lines preserved between non-definition code statements.",
	},
	trailingNewline: {
		type: "boolean",
		default: false,
		legacyName: "wolframTrailingNewline",
		description:
			"Emit one trailing newline at the end of non-empty formatted files.",
	},
	spaceAfterComma: {
		type: "boolean",
		default: true,
		legacyName: "wolframSpaceAfterComma",
		description: "Insert space after commas in argument lists.",
	},
	spaceAroundOperators: {
		type: "boolean",
		default: true,
		legacyName: "wolframSpaceAroundOperators",
		description: "Insert spaces around infix operators.",
	},
	alignRuleValues: {
		type: "boolean",
		default: false,
		legacyName: "wolframAlignRuleValues",
		description:
			"Align Rule and RuleDelayed values vertically in multiline argument, list, and association layouts.",
	},
	logicalOperatorsToFullForm: {
		type: "boolean",
		default: true,
		legacyName: "wolframLogicalOperatorsToFullForm",
		description:
			"Rewrite overflowing logical infix chains as multiline function calls.",
	},
	documentationCommentColumn: {
		type: "int",
		default: 0,
		minimum: 0,
		legacyName: "wolframDocumentationCommentColumn",
		description:
			"Column for trailing documentation comments. 0 = auto-compute per contiguous block.",
	},
	documentationCommentPadding: {
		type: "int",
		default: 2,
		minimum: 1,
		legacyName: "wolframDocumentationCommentPadding",
		description:
			"Minimum spaces between code and an aligned trailing documentation comment in auto mode.",
	},
	documentationCommentMarkers: {
		type: "boolean",
		default: false,
		legacyName: "wolframDocumentationCommentMarkers",
		description:
			"Treat trailing comments beginning with < as documentation comments aligned at printWidth.",
	},
	topLevelSpacingMode: {
		type: "string",
		default: "declarations",
		enum: ["declarations", "all", "none"],
		markdownEnumDescriptions: [
			"Apply definition spacing only to adjacent declarations; preserve ordinary code spacing up to maxBlankLinesBetweenCode.",
			"Apply top-level spacing to all statements.",
			"Remove top-level blank lines.",
		],
		legacyName: "wolframTopLevelSpacingMode",
		description: "Top-level spacing policy: declarations, all, or none.",
	},
	preserveTildeInfixFunctions: {
		type: "string",
		default: "",
		legacyName: "wolframPreserveTildeInfixFunctions",
		description:
			"Comma-separated function names that stay in ~f~ infix form instead of normalizing to f[x, y].",
	},
	moduleVarsBreakThreshold: {
		type: "int",
		default: 40,
		minimum: 0,
		legacyName: "wolframModuleVarsBreakThreshold",
		description:
			"Character count at which Module/With/Block var list breaks.",
	},
	conditionFirstFunctions: {
		type: "string",
		default: "If,Switch",
		legacyName: "wolframConditionFirstFunctions",
		description:
			"Comma-separated symbols whose first arg stays on same line as head.",
	},
	blockStructureFunctions: {
		type: "string",
		default: "Module,With,Block,DynamicModule",
		legacyName: "wolframBlockStructureFunctions",
		description:
			"Comma-separated symbols using block-structure formatting.",
	},
	caseStructureFunctions: {
		type: "string",
		default: "Which",
		legacyName: "wolframCaseStructureFunctions",
		description:
			"Comma-separated symbols using alternating condition/body indentation.",
	},
	lintRules: {
		type: "string",
		default: "{}",
		legacyName: "wolframLintRules",
		description:
			'JSON object of per-rule level overrides, e.g. {"prefer-rule-delayed":"error"}.',
	},
};

const legacyWolframOptions = Object.fromEntries(
	Object.entries(wolframOptions).map(([name, definition]) => [
		definition.legacyName,
		{
			...wolframOptionDefinition(definition),
			deprecated: `Use wolfram.${name} instead.`,
			description: `${definition.description} Deprecated: use wolfram.${name}.`,
		},
	]),
);

export function normalizeWolframOptions(inputOptions = {}) {
	if (!isPlainObject(inputOptions)) return inputOptions ?? {};

	const nestedOptions = isPlainObject(inputOptions.wolfram)
		? inputOptions.wolfram
		: {};
	let normalized = inputOptions;

	for (const [name, definition] of Object.entries(wolframOptions)) {
		if (!hasOwn(nestedOptions, name)) continue;
		if (normalized === inputOptions) normalized = { ...inputOptions };
		normalized[definition.legacyName] = nestedOptions[name];
	}

	return normalized;
}

export const options = {
	wolfram: {
		type: "string",
		category: "Wolfram",
		default: {},
		description: "Wolfram formatter options object.",
		exception: (value) => value == null || isPlainObject(value),
	},
	...legacyWolframOptions,
};

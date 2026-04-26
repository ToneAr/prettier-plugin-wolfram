// src/options.js
export const options = {
  wolframNewlinesBetweenDefinitions: {
    type: 'int',
    category: 'Wolfram',
    default: 1,
    description: 'Blank lines inserted between adjacent definitions.',
  },
  wolframMaxBlankLinesBetweenCode: {
    type: 'int',
    category: 'Wolfram',
    default: 1,
    description: 'Maximum source blank lines preserved between non-definition code statements.',
  },
  wolframSpaceAfterComma: {
    type: 'boolean',
    category: 'Wolfram',
    default: true,
    description: 'Insert space after commas in argument lists.',
  },
  wolframSpaceAroundOperators: {
    type: 'boolean',
    category: 'Wolfram',
    default: true,
    description: 'Insert spaces around infix operators.',
  },
  wolframAlignRuleValues: {
    type: 'boolean',
    category: 'Wolfram',
    default: false,
    description: 'Align Rule and RuleDelayed values vertically in multiline argument, list, and association layouts.',
  },
  wolframDocumentationCommentColumn: {
    type: 'int',
    category: 'Wolfram',
    default: 0,
    description: 'Column for trailing documentation comments. 0 = auto-compute per contiguous block; always clamped above line width.',
  },
  wolframDocumentationCommentPadding: {
    type: 'int',
    category: 'Wolfram',
    default: 2,
    description: 'Minimum spaces between code and an aligned trailing documentation comment in auto mode.',
  },
  wolframTopLevelSpacingMode: {
    type: 'string',
    category: 'Wolfram',
    default: 'declarations',
    description: 'Top-level spacing policy: declarations, all, or none.',
  },
  wolframPreserveTildeInfixFunctions: {
    type: 'string',
    category: 'Wolfram',
    default: '',
    description: 'Comma-separated function names that stay in ~f~ infix form instead of normalizing to f[x, y].',
  },
  wolframCSTRequestTimeoutMs: {
    type: 'int',
    category: 'Wolfram',
    default: 180000,
    description: 'Milliseconds to wait for a WolframKernel CST parse request before restarting the kernel session.',
  },
  wolframModuleVarsBreakThreshold: {
    type: 'int',
    category: 'Wolfram',
    default: 40,
    description: 'Character count at which Module/With/Block var list breaks.',
  },
  wolframConditionFirstFunctions: {
    type: 'string',
    category: 'Wolfram',
    default: 'If,Switch',
    description: 'Comma-separated symbols whose first arg stays on same line as head.',
  },
  wolframBlockStructureFunctions: {
    type: 'string',
    category: 'Wolfram',
    default: 'Module,With,Block,DynamicModule',
    description: 'Comma-separated symbols using block-structure formatting.',
  },
  wolframCaseStructureFunctions: {
    type: 'string',
    category: 'Wolfram',
    default: 'Which',
    description: 'Comma-separated symbols using alternating condition/body indentation.',
  },
  wolframEnginePath: {
    type: 'path',
    category: 'Wolfram',
    default: '',
    description: 'Path to a Wolfram install or executable. Auto-detected if empty.',
  },
  wolframLintRules: {
    type: 'string',
    category: 'Wolfram',
    default: '{}',
    description: 'JSON object of per-rule level overrides, e.g. {"prefer-rule-delayed":"error"}.',
  },
};

<p align="center">
  <img src="https://raw.githubusercontent.com/ToneAr/prettier-plugin-wolfram/main/vscode-extension/assets/icon.png" width="96" height="96" alt="Prettier Wolfram VS Code extension logo">
</p>

<h1 align="center">Prettier - Code Formatter<br><sub>Wolfram Language for VS Code</sub></h1>

<p align="center">
  <strong>Format Wolfram Language files in VS Code with Prettier and <code>@wrel/prettier-plugin-wolfram</code>.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#install">Install</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#extension-settings">Settings</a> ·
  <a href="#troubleshooting">Troubleshooting</a>
</p>

The extension registers the `wolfram` language, provides document and range
formatting, validates Wolfram-specific Prettier options in JSON `.prettierrc`
files, and reports formatter-backed diagnostics with Quick Fix actions.

## Highlights

| Workflow             | What you get                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| Format Wolfram files | Document formatting, selection formatting, and format-on-save support.               |
| Keep feedback close  | Formatter-backed diagnostics with Quick Fixes for ranges or whole files.             |
| Share project config | Prettier and EditorConfig resolution from the current workspace file.                |
| Work without setup   | Bundled Prettier and Wolfram plugin; no Wolfram Engine or kernel required at runtime.|

## Features

- Formats `.wl`, `.wls`, `.wlt`, `.m`, `.mt`, `.nb`, and `.cdf` files assigned
  to the `wolfram` language.
- Supports VS Code `Format Document`, `Format Selection`, `Format Document
With...`, and format-on-save workflows.
- Maps selection formatting to complete top-level Wolfram expressions touched by
  the selection.
- Shows diagnostics for formatter-fixable rule findings and formatting diffs.
- Provides lightbulb Quick Fix actions to format the current diagnostic range or
  the whole document.
- Resolves Prettier configuration with EditorConfig support from the current
  workspace file.
- Adds JSON validation, autocomplete, and hover descriptions for Wolfram
  Prettier options in `.prettierrc`, `.prettierrc.json`, and
  `.prettierrc.json5`.
- Prefers workspace-installed `prettier` and
  `@wrel/prettier-plugin-wolfram`, then falls back to the bundled copies.
- Parsing uses a bundled tree-sitter WebAssembly grammar; no Wolfram kernel is
  required at runtime.

## Requirements

- VS Code 1.75 or newer

The extension bundles Prettier, the Wolfram Prettier plugin, and a tree-sitter
WebAssembly grammar. No Wolfram Engine, Mathematica, or local kernel installation
is required.

## Install

Install from the VS Code Extensions view by searching for:

```text
Prettier - Code formatter (Wolfram Language)
```

For manual installation, install a packaged `.vsix`:

1. Run `Extensions: Install from VSIX...` in VS Code.
2. Select `wolfram-prettier-vscode-<version>.vsix`.

No workspace `npm install` is required for a packaged extension.

## Usage

Open a Wolfram file and run one of VS Code's standard formatting commands:

- `Format Document`
- `Format Selection`
- `Format Document With...`, then choose this formatter if multiple formatters
  are installed

To format on save:

```json
{
	"[wolfram]": {
		"editor.defaultFormatter": "Tone.wolfram-prettier-vscode",
		"editor.formatOnSave": true
	}
}
```

Range formatting formats complete top-level expressions that intersect the
selection. If the selection cannot be mapped safely, no edit is returned.

## Extension Settings

This extension contributes these VS Code settings:

```json
{
	"wolframPrettier.diagnosticSeverity": "information"
}
```

| Setting                              | Default         | Description                                                                                       |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------- |
| `wolframPrettier.diagnosticSeverity` | `"information"` | Severity used for formatter-backed diagnostics. Allowed values are `information`, `warning`, `hint`, and `error`. |

## Prettier Configuration

The extension resolves Prettier configuration from the current file's workspace
with EditorConfig enabled and cache disabled, so `.prettierrc` edits are picked
up immediately.

It passes `parser: "wolfram"` automatically and appends the resolved Wolfram
plugin to any configured `plugins` list. You do not need to add the plugin only
for VS Code formatting, but keeping it in `.prettierrc` is useful when the same
project is formatted from the CLI.

Typical `.prettierrc` example:

```json
{
	"plugins": ["@wrel/prettier-plugin-wolfram"],
	"printWidth": 80,
	"tabWidth": 2,
	"wolfram": {
		"newlinesBetweenDefinitions": 1,
		"newlinesBetweenSameNameDefinitions": 0,
		"maxBlankLinesBetweenCode": 1,
		"trailingNewline": false,
		"spaceAfterComma": true,
		"spaceAroundOperators": true,
		"alignRuleValues": false,
		"documentationCommentColumn": 0,
		"documentationCommentPadding": 2,
		"topLevelSpacingMode": "declarations",
		"preserveTildeInfixFunctions": "",
		"moduleVarsBreakThreshold": 40,
		"conditionFirstFunctions": "If,Switch",
		"blockStructureFunctions": "Module,With,Block,DynamicModule",
		"caseStructureFunctions": "Which",
		"lintRules": "{}"
	}
}
```

Use Prettier's standard `printWidth`, `tabWidth`, `useTabs`, `endOfLine`, and
related options for core Prettier behavior.

## Wolfram Option Reference

| Option                                                | Type        | Default                             | Description                                                                                                                                                                                                               |
| ----------------------------------------------------- | ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wolfram.newlinesBetweenDefinitions`                  | integer     | `1`                                 | Blank lines inserted between adjacent top-level definitions such as `Set`, `SetDelayed`, `TagSet`, `TagSetDelayed`, `UpSet`, and `UpSetDelayed`.                                                                          |
| `wolfram.newlinesBetweenSetDefinitions`               | integer     | inherit                             | Blank lines inserted between adjacent `Set`-family definitions.                                                                                                                                                           |
| `wolfram.newlinesBetweenSetDelayedDefinitions`        | integer     | inherit                             | Blank lines inserted between adjacent `SetDelayed`-family definitions.                                                                                                                                                    |
| `wolfram.newlinesBetweenSetAndSetDelayedDefinitions`  | integer     | inherit                             | Blank lines inserted between mixed `Set`-family and `SetDelayed`-family definitions.                                                                                                                                      |
| `wolfram.newlinesBetweenSameNameDefinitions`          | integer     | `0`                                 | Blank lines inserted between adjacent definitions that belong to the same symbol.                                                                                                                                         |
| `wolfram.maxBlankLinesBetweenCode`                    | integer     | `1`                                 | Maximum source blank lines preserved between non-definition code statements.                                                                                                                                              |
| `wolfram.trailingNewline`                             | boolean     | `false`                             | Emits one trailing newline at the end of non-empty formatted files.                                                                                                                                                       |
| `wolfram.spaceAfterComma`                             | boolean     | `true`                              | Inserts a space after commas in argument lists, lists, and associations.                                                                                                                                                  |
| `wolfram.spaceAroundOperators`                        | boolean     | `true`                              | Inserts spaces around most infix, binary, and ternary operators. Operators that are normally tight, such as `::`, `?`, and `;;`, stay tight.                                                                              |
| `wolfram.alignRuleValues`                             | boolean     | `false`                             | Vertically aligns `Rule` and `RuleDelayed` values in multiline argument, list, and association layouts.                                                                                                                   |
| `wolfram.documentationCommentColumn`                  | integer     | `0`                                 | Column for trailing documentation comments. `0` computes a column per contiguous block.                                                                                                                                   |
| `wolfram.documentationCommentPadding`                 | integer     | `2`                                 | Minimum spaces between code and an aligned trailing documentation comment when the column is computed automatically.                                                                                                      |
| `wolfram.topLevelSpacingMode`                         | string      | `"declarations"`                    | Top-level blank-line policy. Allowed values are `declarations`, `all`, and `none`.                                                                                                                                        |
| `wolfram.preserveTildeInfixFunctions`                 | string      | `""`                                | Comma-separated function names that stay in `x ~ f ~ y` form instead of normalizing to `f[x, y]`.                                                                                                                         |
| `wolfram.moduleVarsBreakThreshold`                    | integer     | `40`                                | Character count at which block-structure variable lists break across lines.                                                                                                                                               |
| `wolfram.conditionFirstFunctions`                     | string      | `"If,Switch"`                       | Comma-separated heads whose first argument stays on the same line as the head when it fits.                                                                                                                               |
| `wolfram.blockStructureFunctions`                     | string      | `"Module,With,Block,DynamicModule"` | Comma-separated heads formatted with block-structure argument layout.                                                                                                                                                     |
| `wolfram.caseStructureFunctions`                      | string      | `"Which"`                           | Comma-separated heads formatted with alternating condition/body indentation.                                                                                                                                              |
| `wolfram.lintRules`                                   | string      | `"{}"`                              | JSON object string for rule-level overrides used by lint integrations, for example `{"prefer-rule-delayed":"error"}`. The extension's diagnostic squiggle severity is controlled by `wolframPrettier.diagnosticSeverity`. |

`wolfram.topLevelSpacingMode` has these values:

| Value          | Behavior                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declarations` | Adjacent definitions use `wolfram.newlinesBetweenDefinitions` plus any configured `Set`/`SetDelayed` and same-name overrides; other top-level code preserves source blank lines up to `wolfram.maxBlankLinesBetweenCode`. |
| `all`          | All top-level statements require at least one blank line when `wolfram.maxBlankLinesBetweenCode` allows it, while still preserving no more than the configured maximum. |
| `none`         | Removes top-level blank lines.                                                                                                                                         |

The `Set`/`SetDelayed` override options inherit
`wolfram.newlinesBetweenDefinitions` when omitted. Same-name definition groups,
such as usage messages, options, attributes, and overloads for the same symbol,
use `wolfram.newlinesBetweenSameNameDefinitions`.

## Diagnostics And Quick Fixes

Diagnostics are formatter-backed hints, not a full language server. They run for
local file-backed Wolfram documents after open, change, and save events.

The extension reports:

- formatter-fixable rule findings such as spacing, line width, top-level
  blank-line spacing, and general infix normalization
- formatting diffs where the formatted document would change whitespace,
  wrapping, comments, or related style details

Diagnostics ignore changes that are only a final newline difference. Quick Fixes
can apply formatting to the diagnostic range or to the whole document.

The global squiggle severity comes from
`wolframPrettier.diagnosticSeverity`. Supported values are `information`,
`warning`, `hint`, and `error`.

## Runtime Resolution

For each file, the extension resolves formatter dependencies in this order:

1. A direct workspace dependency on `prettier`, otherwise bundled Prettier.
2. A plugin checkout when the workspace package is
   `@wrel/prettier-plugin-wolfram` or `prettier-plugin-wolfram`.
3. A direct workspace dependency on `@wrel/prettier-plugin-wolfram` or
   `prettier-plugin-wolfram`.
4. The bundled Wolfram plugin.

This lets editor formatting match CLI formatting when the project installs its
own Prettier and plugin versions, while still working in projects with no local
Node dependencies.

## File Associations

The extension contributes the `wolfram` language for these extensions:

```text
.wl .wls .wlt .m .mt .nb .cdf
```

Formatting expects text Wolfram Language source. Binary or notebook-structured
files should not be formatted as plain text.

To format another custom extension, add a VS Code file association:

```json
{
	"files.associations": {
		"*.wlx": "wolfram"
	}
}
```

## Troubleshooting

Formatting does not run:
Make sure the file language mode is `Wolfram` and select this extension with
`Format Document With...` if another formatter is installed.

Diagnostics do not appear immediately:
Diagnostics run after documents open, change, or save. Large files may delay
the first result.

Config changes are not reflected:
The extension disables Prettier's config cache for resolution, but VS Code may
need the file to be reformatted or diagnostics to refresh after an edit.

More detail:
Open the `Prettier (Wolfram)` output channel.

## Development

From the repository root, build the standalone extension package with:

```bash
npm run package:vscode:standalone
```

This writes `vscode-extension/wolfram-prettier-vscode-<version>.vsix`.

For Marketplace pre-release publishing from the repository root:

```bash
npm run publish:vscode:pre-release
```

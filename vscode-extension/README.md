<p align="center">
  <img src="https://raw.githubusercontent.com/ToneAr/prettier-wolfram/main/vscode-extension/assets/icon.png" width="96" height="96" alt="Prettier Wolfram VS Code extension logo">
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

| Workflow | What you get |
| --- | --- |
| Format Wolfram files | Document formatting, selection formatting, and format-on-save support. |
| Keep feedback close | Formatter-backed diagnostics with Quick Fixes for ranges or whole files. |
| Share project config | Prettier and EditorConfig resolution from the current workspace file. |
| Work without setup | Bundled Prettier and Wolfram plugin fallback when a workspace has no local install. |

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
- Reuses the plugin's shared Wolfram kernel helper across CLI and editor
  requests.

## Requirements

- VS Code 1.75 or newer
- Node.js available on `PATH`
- A local Wolfram Engine or Mathematica installation with `CodeParser`
- `WolframKernel` discoverable automatically, or an explicit Wolfram engine path

The extension bundles Prettier and the Wolfram Prettier plugin. Parsing still
requires a local Wolfram runtime.

If VS Code cannot find `node`, set `WOLFRAM_NODE_PATH` to a Node.js executable
before launching VS Code.

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
  "wolframPrettier.wolframEnginePath": "",
  "wolframPrettier.diagnosticSeverity": "information",
  "wolframPrettier.cstRequestTimeoutMs": 180000
}
```

| Setting | Default | Description |
| --- | --- | --- |
| `wolframPrettier.wolframEnginePath` | `""` | Path to a Wolfram install directory, a `WolframKernel` executable, or a `wolframscript` executable. Empty means auto-detect. |
| `wolframPrettier.diagnosticSeverity` | `"information"` | Severity used for formatter-backed diagnostics. Allowed values are `information`, `warning`, `hint`, and `error`. |
| `wolframPrettier.cstRequestTimeoutMs` | `180000` | Milliseconds to wait for a WolframKernel CST parse request before timing out and allowing the kernel session to restart. Minimum effective value is `1000`. |

Use `wolframPrettier.wolframEnginePath` for editor-only setup. Use the Prettier
option `wolframEnginePath` when the same path should also apply to CLI
formatting.

After changing `wolframPrettier.wolframEnginePath`, reload the VS Code window so
the extension can restart with the updated environment.

`wolframPrettier.cstRequestTimeoutMs` supplies the editor default for formatter
requests. A `wolframCSTRequestTimeoutMs` value in the resolved Prettier config
takes precedence for that file.

## Prettier Configuration

The extension resolves Prettier configuration from the current file's workspace
with EditorConfig enabled and cache disabled, so `.prettierrc` edits are picked
up immediately.

It passes `parser: "wolfram"` automatically and appends the resolved Wolfram
plugin to any configured `plugins` list. You do not need to add the plugin only
for VS Code formatting, but keeping it in `.prettierrc` is useful when the same
project is formatted from the CLI.

Complete `.prettierrc` example:

```json
{
  "plugins": ["@wrel/prettier-plugin-wolfram"],
  "printWidth": 80,
  "tabWidth": 2,
  "wolframNewlinesBetweenDefinitions": 1,
  "wolframMaxBlankLinesBetweenCode": 1,
  "wolframSpaceAfterComma": true,
  "wolframSpaceAroundOperators": true,
  "wolframAlignRuleValues": false,
  "wolframDocumentationCommentColumn": 0,
  "wolframDocumentationCommentPadding": 2,
  "wolframTopLevelSpacingMode": "declarations",
  "wolframPreserveTildeInfixFunctions": "",
  "wolframCSTRequestTimeoutMs": 180000,
  "wolframModuleVarsBreakThreshold": 40,
  "wolframConditionFirstFunctions": "If,Switch",
  "wolframBlockStructureFunctions": "Module,With,Block,DynamicModule",
  "wolframCaseStructureFunctions": "Which",
  "wolframEnginePath": "",
  "wolframLintRules": "{}"
}
```

Use Prettier's standard `printWidth`, `tabWidth`, `useTabs`, `endOfLine`, and
related options for core Prettier behavior.

## Wolfram Option Reference

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `wolframNewlinesBetweenDefinitions` | integer | `1` | Blank lines inserted between adjacent top-level definitions such as `Set`, `SetDelayed`, `TagSet`, `TagSetDelayed`, `UpSet`, and `UpSetDelayed`. |
| `wolframMaxBlankLinesBetweenCode` | integer | `1` | Maximum source blank lines preserved between non-definition code statements. |
| `wolframSpaceAfterComma` | boolean | `true` | Inserts a space after commas in argument lists, lists, and associations. |
| `wolframSpaceAroundOperators` | boolean | `true` | Inserts spaces around most infix, binary, and ternary operators. Operators that are normally tight, such as `::`, `?`, and `;;`, stay tight. |
| `wolframAlignRuleValues` | boolean | `false` | Vertically aligns `Rule` and `RuleDelayed` values in multiline argument, list, and association layouts. |
| `wolframDocumentationCommentColumn` | integer | `0` | Column for trailing documentation comments. `0` computes a column per contiguous block. Explicit values are clamped above `printWidth`. |
| `wolframDocumentationCommentPadding` | integer | `2` | Minimum spaces between code and an aligned trailing documentation comment when the column is computed automatically. |
| `wolframTopLevelSpacingMode` | string | `"declarations"` | Top-level blank-line policy. Allowed values are `declarations`, `all`, and `none`. |
| `wolframPreserveTildeInfixFunctions` | string | `""` | Comma-separated function names that stay in `x ~ f ~ y` form instead of normalizing to `f[x, y]`. |
| `wolframCSTRequestTimeoutMs` | integer | `180000` | Milliseconds to wait for a WolframKernel CST parse request before the request is timed out and the kernel session can be restarted. Minimum effective value is `1000`. |
| `wolframModuleVarsBreakThreshold` | integer | `40` | Character count at which block-structure variable lists break across lines. |
| `wolframConditionFirstFunctions` | string | `"If,Switch"` | Comma-separated heads whose first argument stays on the same line as the head when it fits. |
| `wolframBlockStructureFunctions` | string | `"Module,With,Block,DynamicModule"` | Comma-separated heads formatted with block-structure argument layout. |
| `wolframCaseStructureFunctions` | string | `"Which"` | Comma-separated heads formatted with alternating condition/body indentation. |
| `wolframEnginePath` | path string | `""` | Path to a Wolfram install directory, a `WolframKernel` executable, or a `wolframscript` executable. Empty means auto-detect. |
| `wolframLintRules` | string | `"{}"` | JSON object string for rule-level overrides used by lint integrations, for example `{"prefer-rule-delayed":"error"}`. The extension's diagnostic squiggle severity is controlled by `wolframPrettier.diagnosticSeverity`. |

`wolframTopLevelSpacingMode` has these values:

| Value | Behavior |
| --- | --- |
| `declarations` | Adjacent definitions use `wolframNewlinesBetweenDefinitions`; other top-level code preserves source blank lines up to `wolframMaxBlankLinesBetweenCode`. |
| `all` | All top-level statements require at least one blank line when `wolframMaxBlankLinesBetweenCode` allows it, while still preserving no more than the configured maximum. |
| `none` | Removes top-level blank lines. |

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

`WolframKernel not found`:
Set `wolframPrettier.wolframEnginePath`, set `wolframEnginePath` in Prettier
config, set `WOLFRAM_ENGINE_PATH`, or make sure `WolframKernel` is available on
`PATH`.

`Node.js not found in PATH`:
Install Node.js and make it available on `PATH`, or set `WOLFRAM_NODE_PATH` to
the Node.js executable before starting VS Code.

Formatting does not run:
Make sure the file language mode is `Wolfram` and select this extension with
`Format Document With...` if another formatter is installed.

Diagnostics do not appear immediately:
Diagnostics run after documents open, change, or save. Large files and cold
Wolfram startup can delay the first result.

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

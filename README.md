<p align="center">
  <img src="vscode-extension/assets/icon.png" width="96" height="96" alt="@wrel/prettier-plugin-wolfram logo">
</p>

<h1 align="center">@wrel/prettier-plugin-wolfram</h1>

<p align="center">
  <strong>Prettier 3 formatting for Wolfram Language, powered by Wolfram CodeParser.</strong>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#cli-usage">CLI</a> ·
  <a href="#prettier-configuration">Configuration</a> ·
  <a href="#vs-code-extension">VS Code</a>
</p>

The plugin parses Wolfram Language through Wolfram `CodeParser` and prints the
result with Prettier. It supports `.wl`, `.wls`, `.wlt`, `.mt`, and `.m` files.
The normal runtime uses a shared local helper process so repeated CLI and VS
Code formatting requests can reuse one warm Wolfram kernel. A native WSTP addon
can be built manually, but it is optional.

## At A Glance

| Need | What this package provides |
| --- | --- |
| Prettier formatting | A Wolfram parser and printer for Prettier 3 projects. |
| Editor support | A bundled VS Code extension with document, range, and format-on-save workflows. |
| Diagnostics | Formatter-backed rule findings, line-width hints, and fixable style diffs. |
| Runtime reuse | A shared local Wolfram kernel helper for faster repeated formatting requests. |

## Requirements

- Node.js
- Prettier 3.x
- A local Wolfram Engine or Mathematica installation with `CodeParser`
- `WolframKernel` discoverable automatically, or `wolframEnginePath`
  configured explicitly

## Install

Install Prettier and the plugin in the project that contains your Wolfram
source:

```bash
npm install --save-dev prettier @wrel/prettier-plugin-wolfram
```

Add the plugin to your Prettier configuration for CLI use:

```json
{
  "plugins": ["@wrel/prettier-plugin-wolfram"]
}
```

## CLI Usage

Format a file to stdout:

```bash
npx prettier --plugin @wrel/prettier-plugin-wolfram --parser wolfram file.wl
```

Write changes back:

```bash
npx prettier --plugin @wrel/prettier-plugin-wolfram --parser wolfram --write file.wl
```

Check whether files would change:

```bash
npx prettier --plugin @wrel/prettier-plugin-wolfram --parser wolfram --check "src/**/*.wl"
```

Format a byte range with Prettier's standard range flags:

```bash
npx prettier --plugin @wrel/prettier-plugin-wolfram --parser wolfram --range-start 0 --range-end 200 file.wl
```

Range formatting expands to the top-level Wolfram expressions touched by the
range. This avoids formatting incomplete fragments that `CodeParser` cannot
parse on their own.

## Formatting Features

- Formats Wolfram calls, lists, associations, prefix, postfix, infix, binary,
  ternary, compound, and leaf nodes produced by `CodeParser`.
- Applies specialized layouts to configurable block-style forms such as
  `Module`, `With`, `Block`, and `DynamicModule`.
- Applies condition-first layout to configurable forms such as `If` and
  `Switch`.
- Applies alternating condition/body layout to configurable case forms such as
  `Which`.
- Wraps long string literals and flattens nested `StringJoin[...]` calls into a
  stable multiline `StringJoin[...]` layout when needed.
- Preserves leading comments, trailing comments, multiline comments, and
  top-level comment blocks.
- Aligns trailing documentation comments either automatically or at a configured
  column.
- Preserves ordinary blank lines up to a configured cap and controls spacing
  between adjacent definitions separately.
- Optionally aligns `Rule` and `RuleDelayed` values in multiline argument, list,
  and association layouts.
- Normalizes general infix `x ~ f ~ y` to `f[x, y]` unless the function head is
  listed in `wolframPreserveTildeInfixFunctions`.
- Leaves parse-error files and unsupported CST nodes as original source instead
  of printing internal parser details.
- Produces idempotent output: a second format pass should not change the first
  pass result.

## Prettier Configuration

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
related options for normal Prettier behavior. The options below are specific to
this plugin.

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
| `wolframLintRules` | string | `"{}"` | JSON object string for rule-level overrides used by lint integrations, for example `{"prefer-rule-delayed":"error"}`. |

### Top-Level Spacing

`wolframTopLevelSpacingMode` controls how the two blank-line options are applied:

| Value | Behavior |
| --- | --- |
| `declarations` | Adjacent definitions use `wolframNewlinesBetweenDefinitions`; other top-level code preserves source blank lines up to `wolframMaxBlankLinesBetweenCode`. |
| `all` | All top-level statements require at least one blank line when `wolframMaxBlankLinesBetweenCode` allows it, while still preserving no more than the configured maximum. |
| `none` | Removes top-level blank lines. |

Set `wolframMaxBlankLinesBetweenCode` to `0` to remove preserved ordinary code
gaps. Set `wolframNewlinesBetweenDefinitions` to `0` to keep adjacent
definitions together.

### Custom Form Layout

The layout categories are driven by comma-separated symbol lists:

```json
{
  "wolframConditionFirstFunctions": "If,Switch,MyConditionForm",
  "wolframBlockStructureFunctions": "Module,With,Block,DynamicModule,MyBlock",
  "wolframCaseStructureFunctions": "Which,MyCaseForm"
}
```

Direct comments inside a specialized call cause the formatter to fall back to
the generic call layout so comments stay attached to the original arguments.

## Lint CLI

The package also exposes a small rule runner:

```bash
npx prettier-wolfram lint "src/**/*.wl"
```

It prints diagnostics as:

```text
path/to/file.wl:line:column: WARN [rule-name] message
```

Override rule levels with `WOLFRAM_LINT_RULES`:

```bash
WOLFRAM_LINT_RULES='{"no-bare-symbol-set":"off","prefer-rule-delayed":"error"}' \
  npx prettier-wolfram lint "src/**/*.wl"
```

Rule levels are `off`, `warn`, and `error`.

| Rule | Default | Formatter-fixable | Description |
| --- | --- | --- | --- |
| `line-width` | `warn` | yes | Reports lines exceeding `printWidth`, ignoring comment-only overflow. |
| `newlines-between-definitions` | `warn` | yes | Reports top-level blank-line spacing that differs from the configured policy. |
| `spacing-operators` | `warn` | yes | Reports operator spacing inconsistent with `wolframSpaceAroundOperators`. |
| `spacing-commas` | `warn` | yes | Reports comma spacing inconsistent with `wolframSpaceAfterComma`. |
| `no-general-infix-function` | `warn` | yes | Reports general infix `x ~ f ~ y` forms unless `f` is preserved. |
| `prefer-rule-delayed` | `warn` | no | Reports definitions where `SetDelayed` is safer because the right-hand side references pattern variables. |
| `no-bare-symbol-set` | `warn` | no | Reports top-level global symbol assignments such as `x = value`. |
| `no-dynamic-module-leak` | `warn` | no | Reports assignments inside `Module`, `Block`, or `DynamicModule` to symbols missing from the variable list. |
| `no-shadowed-pattern` | `error` | no | Reports pattern variables that shadow local variables from `Module`, `With`, or `Block`. |
| `no-unused-module-var` | `warn` | no | Reports unused variables declared in `Module`, `With`, `Block`, or `DynamicModule`. |

## Bridge Runtime

No manual startup is required for normal usage. On the first parse request, the
plugin auto-starts `scripts/kernel-server.js` and connects to it over a Unix
domain socket on Linux/macOS or a named pipe on Windows. The helper owns one
Wolfram kernel and serves later CLI and VS Code requests from the same local
process.

Kernel discovery checks explicit configuration first, then common Wolfram
install locations and `WolframKernel` available on `PATH`. You can also set
`WOLFRAM_ENGINE_PATH` in the environment.

If VS Code or another Electron host cannot find a real Node.js executable, set
`WOLFRAM_NODE_PATH` to the `node` executable before launching the host.

To inspect startup and connection reuse from a repository checkout:

```bash
npm run debug:bridge
```

You can also start the helper directly:

```bash
node scripts/kernel-server.js
```

A successful manual start prints:

```text
KERNEL_READY
```

## Optional Native Addon Build

The published package does not build the WSTP addon during `npm install`. If
you want the native WSTP path in a repository checkout, build it manually:

```bash
npm run build:addon
```

When `wstp-addon/build/Release/wstp.node` exists, the helper tries that native
backend first. If loading or startup fails, it falls back to the script-based
kernel backend.

## VS Code Extension

Build the standalone `.vsix` that bundles Prettier and this plugin:

```bash
npm run package:vscode:standalone
```

This writes `vscode-extension/wolfram-prettier-vscode-<version>.vsix`.

For Marketplace pre-release publishing, use the workspace-safe publish wrapper:

```bash
npm run publish:vscode:pre-release
```

The extension README with editor setup, settings, diagnostics, and file
association behavior lives at `vscode-extension/README.md`.

## Publishing To Verdaccio

Log in:

```bash
npm login --registry http://localhost:4873
```

Preview package contents:

```bash
npm pack --dry-run
```

Publish:

```bash
npm publish --registry http://localhost:4873
```

Verify:

```bash
npm view @wrel/prettier-plugin-wolfram --registry http://localhost:4873
```

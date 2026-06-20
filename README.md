<p align="center">
  <img src="vscode-extension/assets/icon.png" width="96" height="96" alt="@wrel/prettier-plugin-wolfram logo">
</p>

<h1 align="center">@wrel/prettier-plugin-wolfram</h1>

<p align="center">
  <strong>Prettier 3 formatting for Wolfram Language, powered by tree-sitter.</strong>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#cli-usage">CLI</a> ·
  <a href="#prettier-configuration">Configuration</a> ·
  <a href="#vs-code-extension">VS Code</a>
</p>

The plugin parses Wolfram Language through a bundled tree-sitter WebAssembly
grammar and prints the result with Prettier. It supports `.wl`, `.wls`, `.wlt`,
`.mt`, and `.m` files. No Wolfram Engine or local kernel installation is required.

## At A Glance

| Need                | What this package provides                                                       |
| ------------------- | -------------------------------------------------------------------------------- |
| Prettier formatting | A Wolfram parser and printer for Prettier 3 projects.                            |
| Editor support      | A bundled VS Code extension with document, range, and format-on-save workflows.  |
| Diagnostics         | Formatter-backed rule findings, line-width hints, and fixable style diffs.       |
| Zero dependencies   | Parsing via a bundled tree-sitter WASM grammar; no Wolfram Engine required.      |

## Requirements

- Node.js
- Prettier 3.x

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
range. This avoids formatting incomplete fragments that the parser cannot
parse on their own.

## Formatting Features

- Formats Wolfram calls, lists, associations, prefix, postfix, infix, binary,
  ternary, compound, and leaf nodes produced by the tree-sitter grammar.
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
  between adjacent definitions, including separate `Set` and `SetDelayed`
  definition groups.
- Optionally aligns `Rule` and `RuleDelayed` values in multiline argument, list,
  and association layouts.
- Normalizes general infix `x ~ f ~ y` to `f[x, y]` unless the function head is
  listed in `wolfram.preserveTildeInfixFunctions`.
- Leaves parse-error files and unsupported CST nodes as original source instead
  of printing internal parser details.
- Produces idempotent output: a second format pass should not change the first
  pass result.

## Prettier Configuration

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
related options for normal Prettier behavior. The options below are specific to
this plugin.

| Option                                                | Type        | Default                             | Description |
| ----------------------------------------------------- | ----------- | ----------------------------------- | ----------- |
| `wolfram.newlinesBetweenDefinitions`                  | integer     | `1`                                 | Blank lines inserted between adjacent top-level definitions such as `Set`, `SetDelayed`, `TagSet`, `TagSetDelayed`, `UpSet`, and `UpSetDelayed`. |
| `wolfram.newlinesBetweenSetDefinitions`               | integer     | inherit                             | Blank lines inserted between adjacent `Set`-family definitions. |
| `wolfram.newlinesBetweenSetDelayedDefinitions`        | integer     | inherit                             | Blank lines inserted between adjacent `SetDelayed`-family definitions. |
| `wolfram.newlinesBetweenSetAndSetDelayedDefinitions`  | integer     | inherit                             | Blank lines inserted between mixed `Set`-family and `SetDelayed`-family definitions. |
| `wolfram.newlinesBetweenSameNameDefinitions`          | integer     | `0`                                 | Blank lines inserted between adjacent definitions that belong to the same symbol. |
| `wolfram.maxBlankLinesBetweenCode`                    | integer     | `1`                                 | Maximum source blank lines preserved between non-definition code statements. |
| `wolfram.trailingNewline`                             | boolean     | `false`                             | Emits one trailing newline at the end of non-empty formatted files. |
| `wolfram.spaceAfterComma`                             | boolean     | `true`                              | Inserts a space after commas in argument lists, lists, and associations. |
| `wolfram.spaceAroundOperators`                        | boolean     | `true`                              | Inserts spaces around most infix, binary, and ternary operators. Operators that are normally tight, such as `::`, `?`, and `;;`, stay tight. |
| `wolfram.alignRuleValues`                             | boolean     | `false`                             | Vertically aligns `Rule` and `RuleDelayed` values in multiline argument, list, and association layouts. |
| `wolfram.documentationCommentColumn`                  | integer     | `0`                                 | Column for trailing documentation comments. `0` computes a column per contiguous block. |
| `wolfram.documentationCommentPadding`                 | integer     | `2`                                 | Minimum spaces between code and an aligned trailing documentation comment when the column is computed automatically. |
| `wolfram.topLevelSpacingMode`                         | string      | `"declarations"`                    | Top-level blank-line policy. Allowed values are `declarations`, `all`, and `none`. |
| `wolfram.preserveTildeInfixFunctions`                 | string      | `""`                                | Comma-separated function names that stay in `x ~ f ~ y` form instead of normalizing to `f[x, y]`. |
| `wolfram.moduleVarsBreakThreshold`                    | integer     | `40`                                | Character count at which block-structure variable lists break across lines. |
| `wolfram.conditionFirstFunctions`                     | string      | `"If,Switch"`                       | Comma-separated heads whose first argument stays on the same line as the head when it fits. |
| `wolfram.blockStructureFunctions`                     | string      | `"Module,With,Block,DynamicModule"` | Comma-separated heads formatted with block-structure argument layout. |
| `wolfram.caseStructureFunctions`                      | string      | `"Which"`                           | Comma-separated heads formatted with alternating condition/body indentation. |
| `wolfram.lintRules`                                   | string      | `"{}"`                              | JSON object string for rule-level overrides used by lint integrations, for example `{"prefer-rule-delayed":"error"}`. |

### Top-Level Spacing

`wolfram.topLevelSpacingMode` controls how the blank-line options are applied:

| Value          | Behavior    |
| -------------- | ----------- |
| `declarations` | Adjacent definitions use `wolfram.newlinesBetweenDefinitions` plus any configured `Set`/`SetDelayed` and same-name overrides; other top-level code preserves source blank lines up to `wolfram.maxBlankLinesBetweenCode`. |
| `all`          | All top-level statements require at least one blank line when `wolfram.maxBlankLinesBetweenCode` allows it, while still preserving no more than the configured maximum. |
| `none`         | Removes top-level blank lines. |

Set `wolfram.maxBlankLinesBetweenCode` to `0` to remove preserved ordinary code
gaps. Set `wolfram.newlinesBetweenDefinitions` to `0` to keep adjacent
definitions together.

The `Set`/`SetDelayed` override options inherit
`wolfram.newlinesBetweenDefinitions` when omitted. Same-name definition groups,
such as usage messages, options, attributes, and overloads for the same symbol,
use `wolfram.newlinesBetweenSameNameDefinitions`.

### Custom Form Layout

The layout categories are driven by comma-separated symbol lists:

```json
{
	"wolfram": {
		"conditionFirstFunctions": "If,Switch,MyConditionForm",
		"blockStructureFunctions": "Module,With,Block,DynamicModule,MyBlock",
		"caseStructureFunctions": "Which,MyCaseForm"
	}
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

| Rule                           | Default | Formatter-fixable | Description |
| ------------------------------ | ------- | ----------------- | ----------- |
| `line-width`                   | `warn`  | yes  | Reports lines exceeding `printWidth`, ignoring comment-only overflow. |
| `newlines-between-definitions` | `warn`  | yes  | Reports top-level blank-line spacing that differs from the configured policy. |
| `spacing-operators`            | `warn`  | yes  | Reports operator spacing inconsistent with `wolfram.spaceAroundOperators`. |
| `spacing-commas`               | `warn`  | yes  | Reports comma spacing inconsistent with `wolfram.spaceAfterComma`. |
| `no-general-infix-function`    | `warn`  | yes  | Reports general infix `x ~ f ~ y` forms unless `f` is preserved. |
| `prefer-rule-delayed`          | `warn`  | no   | Reports definitions where `SetDelayed` is safer because the right-hand side references pattern variables. |
| `no-bare-symbol-set`           | `warn`  | no   | Reports top-level global symbol assignments such as `x = value`. |
| `no-dynamic-module-leak`       | `warn`  | no   | Reports assignments inside `Module`, `Block`, or `DynamicModule` to symbols missing from the variable list. |
| `no-shadowed-pattern`          | `error` | no   | Reports pattern variables that shadow local variables from `Module`, `With`, or `Block`. |
| `no-unused-module-var`         | `warn`  | no   | Reports unused variables declared in `Module`, `With`, `Block`, or `DynamicModule`. |

## Parse Runtime

The plugin uses a bundled tree-sitter WebAssembly grammar
(`src/parser/tree-sitter-wolfram.wasm`) to parse Wolfram Language. No Wolfram
Engine, Mathematica installation, or kernel process is required at runtime.

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

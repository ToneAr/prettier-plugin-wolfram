# Design: Convert prettier-plugin-wolfram to a tree-sitter back-end

**Date:** 2026-06-19
**Status:** Approved (architecture); detailed sections below pre-approved by user ("go ahead with implementation")

## Goal

Replace the Wolfram-kernel / WSTP / CodeParser parsing back-end with the
[`mtirard/zed-wolfram-treesitter`](https://github.com/mtirard/zed-wolfram-treesitter)
grammar so the plugin has **no runtime dependency on a Wolfram Kernel, WSTP, or
`wolframscript`**. All existing formatting rules and features are preserved
unchanged.

## Key decisions (locked in during brainstorming)

1. **Runtime:** `web-tree-sitter` (WASM). One compiled `.wasm` works in both the
   Prettier CLI (Node) and the bundled VS Code extension (Electron) with no
   native build step for end users. Avoids the node-gyp / Electron-ABI pain that
   the current native WSTP addon causes.
2. **Grammar source:** added as a **git submodule** at `grammar/`. An
   `npm run build:grammar` script runs `tree-sitter generate` + `tree-sitter
   build --wasm` and writes `src/parser/tree-sitter-wolfram.wasm` (committed).
   The submodule commit and the shipped wasm stay in lockstep. We co-develop the
   grammar upstream and push changes from inside the submodule.
3. **Equivalence oracle:** a **frozen golden corpus** captured once from a real
   Wolfram kernel — for each `input.wl`, the CodeParser CST JSON plus the
   formatted output produced by today's translator. The adapter is built
   test-first to reproduce these CSTs **byte-identically**. After capture the
   kernel is never needed again.
4. **Removal:** delete the entire runtime kernel stack (`src/bridge/`,
   `scripts/kernel-server.js`, `scripts/find-wstp.js`, `wstp-addon/`,
   `node-addon-api` dependency, `bridge/*` tests). Keep a single **dev-only**
   `scripts/capture-golden.mjs` (run manually with `wolframscript`, not in the
   npm `files` list) to regenerate the golden corpus.
5. **Coverage — tiered definition of done:**
   - **Tier 1 (must match exactly):** everything in the existing corpus
     (`tests/wl/*.wl`, `tests/fixtures/`), every construct the rules /
     special-forms depend on, and the known gaps — Slot `#`/`#1`/`#name`,
     SlotSequence `##`, Out `%`/`%n`, MessageName `a::b` / `::usage`, Get/Put
     `<<`/`>>`/`>>>`, tilde-infix `~f~`, pure functions, patterns, associations.
   - **Tier 2 (best-effort):** other common ASCII operators/forms, added as the
     corpus grows.
   - **Tier 3 (graceful degradation):** exotic/rare syntax (full LongName
     operator zoo, 2D boxes). If the grammar can't represent it yet, the file
     round-trips unchanged — identical to today's behavior on a parse error —
     rather than mis-formatting.
   - **Measurable bar:** every golden-corpus file formats byte-identically to the
     kernel-captured output, and the full existing test suite passes against the
     tree-sitter pipeline.

## Architecture

Swap only the parse front-end. Everything from the CST-JSON boundary onward is
unchanged.

**Today:**
```
text → KernelBridge.getCST() ──(socket → WL kernel → CodeParser)──> CST JSON
     → buildOffsetTable/addOffsets → translator/printNode → Prettier Doc
```

**After:**
```
text → WolframParser.getCST() ──(web-tree-sitter WASM)──> tree-sitter tree
     → adapter (tree → CodeParser-shaped CST JSON)
     → buildOffsetTable/addOffsets → translator/printNode → Prettier Doc   ← UNCHANGED
```

`src/index.js`'s `parse()` changes by ~one import: `KernelBridge` →
`WolframParser`, same `getCST(text, options) → cst` signature. From `addOffsets`
onward the code path is byte-for-byte identical.

| New | Replaces / deletes |
|---|---|
| `grammar/` (submodule) + `src/parser/tree-sitter-wolfram.wasm` (committed) | Wolfram kernel / CodeParser |
| `src/parser/index.js` — loads WASM, parses, runs adapter, exposes `WolframParser` | `src/bridge/**` (deleted) |
| `src/parser/adapter.js` — tree-sitter tree → CodeParser CST JSON | `scripts/kernel-server.js`, `scripts/find-wstp.js`, `wstp-addon/**` (deleted) |
| `scripts/capture-golden.mjs` (dev-only) | — |

**Untouched:** `src/translator/**`, `src/rules/**`, `src/utils/offsets.js`,
`src/utils/cstErrors.js`, `src/options.js`, all translator/rules tests, all 18
existing fixture CSTs.

## The adapter (`src/parser/adapter.js`) — the core of the work

The adapter's contract: given a `web-tree-sitter` `Tree` and the source text,
produce a plain-object CST identical in shape to what `CodeParser` emits, so
`addOffsets` and `printNode` consume it unchanged.

### Output contract (CodeParser CST shape)

- Node objects: `{ type, kind?, op?, value?, head?, children?, source }`.
- `source` is **1-based** `[[startLine, startCol], [endLine, endCol]]`, char-column
  based (consistent with `buildOffsetTable`/`lineColToOffset`). The adapter
  converts tree-sitter positions to 1-based char line/col using the source text
  (not raw UTF-16/byte columns), so multibyte input stays exact.
- Node types produced: `ContainerNode`, `CallNode`, `InfixNode`, `BinaryNode`,
  `PrefixNode`, `PostfixNode`, `CompoundNode`, `GroupNode`, `TernaryNode`,
  `LeafNode`, and `Unknown` (for errors).

### Node mapping (exact target shapes are defined by the golden CST)

| tree-sitter | CodeParser CST |
|---|---|
| `source_file` | `ContainerNode` kind `String`, children = mapped top-level exprs |
| `symbol` | `LeafNode` kind `Symbol` |
| `integer` / `real` | `LeafNode` kind `Integer` / `Real` |
| `string` | `LeafNode` kind `String` |
| `comment` | `LeafNode` kind `` Token`Comment `` |
| `blank*` / `pattern` | CodeParser pattern/blank shapes (defined by golden capture) |
| `prefix` | `PrefixNode` + op name from operator token (`-`→`Minus`, `!`→`Not`, …) |
| `postfix` | `PostfixNode` + op name (`&`→`Function`, `..`→`Repeated`, `'`→`Derivative`, `!`→`Factorial`, …) |
| `binary` | `BinaryNode` + op name (`=`→`Set`, `:=`→`SetDelayed`, `->`→`Rule`, `:>`→`RuleDelayed`, `/;`→`Condition`, …) |
| `infix` | `InfixNode` + op name; **left-assoc chains of the same operator flattened** into one flat node with interspersed operator leaves (e.g. `a+b+c` → `InfixNode op:Plus`). `,`→`Comma`; `;`→`CompoundExpression` |
| `call` | `CallNode` head + children `[OpenSquare leaf, flattened-Comma args, CloseSquare leaf]` |
| `part` | CodeParser `Part` shape (defined by golden capture) |
| `span` | `BinaryNode`/`TernaryNode` op `Span` (defined by golden capture) |
| `group` | `GroupNode` kind from delimiters: `{}`→`List`, `<\|...\|>`→`Association`, `()`→paren shape, `[]`→group |
| `ERROR` / `MISSING` | `{ type: "Unknown", kind: "SyntaxErrorNode[...]" }` → caught by `containsCstErrors` → file round-trips unchanged |

Operators are **anonymous string tokens** in this grammar (no `op` field). The
adapter reads the operator's literal text from the tree and maps it to the
CodeParser op name via a maintained table. The exact CST shapes for the
intricate forms (patterns, parts, spans, derivatives) are **not guessed** — they
are read directly from the captured golden CST, which is the source of truth.

### Comments and whitespace

- **Comments:** `$.comment` is a named external node in `extras`; tree-sitter
  surfaces it in the tree between siblings. The adapter walks including extras and
  emits comment `LeafNode`s into the children arrays at their source position, as
  CodeParser does.
- **Whitespace:** the grammar drops `/\s/`. **Phase 0 verifies** whether the
  translator actually consumes whitespace `LeafNode`s or only filters them via
  `isTrivia` (the comment-spacing logic appears to use source-position gaps, not
  whitespace leaves). If only filtered, the adapter need not emit whitespace
  leaves at all — a significant simplification. The Phase-0 finding is recorded
  before the adapter contract is frozen.

## Runtime integration (`src/parser/index.js`)

- Lazy-initialize `web-tree-sitter`, load the committed wasm once, cache the
  `Parser` instance (replaces the warm-kernel reuse model — WASM init is cheap and
  in-process, so no socket/helper-process machinery is needed).
- Expose `WolframParser` with `getCST(text, options)` matching the old
  `KernelBridge` signature so `src/index.js` is a near drop-in.
- On any tree-sitter `ERROR`/`MISSING` node, the adapter emits an `Unknown`
  error node; `containsCstErrors` then drives `createUnformattableNode` →
  round-trip. This preserves today's "don't mangle un-parseable input" behavior.

## Oracle & test strategy

- `scripts/capture-golden.mjs` (dev-only, `wolframscript`): for each
  `tests/golden/*.wl`, write `<name>.cst.json` (CodeParser CST) and
  `<name>.formatted.wl` (today's translator output on that CST — pure JS, no
  kernel needed for the formatting half).
- Corpus seeded from existing `tests/wl/*.wl` plus targeted construct files
  (slots, patterns, associations, message names, get/put, spans, derivatives,
  compound expressions, nested calls, comments).
- New test `tests/parser/adapter.golden.test.js`: for each corpus entry,
  `adapter(parse(input))` deep-equals `<name>.cst.json`.
- New test `tests/parser/format.golden.test.js`: full pipeline output equals
  `<name>.formatted.wl`, and is idempotent.
- Existing translator/rules tests and the 18 fixtures stay as-is (they already
  validate the unchanged downstream). `formatted-output.test.js` now runs
  kernel-free.

## Grammar extension (submodule, upstream PRs)

Driven by the golden corpus: any input that yields an `ERROR` node or a CST the
adapter can't map to the correct CodeParser shape is a grammar gap. Add rules for
the Tier-1 gaps first: Slot `#`/`#n`/`#name`, SlotSequence `##`/`##n`, Out
`%`/`%n`/`%%`, MessageName `::`, Get/Put `<<`/`>>`/`>>>`, tilde-infix `~f~`, span
edge cases, contexts, and common LongName operators as feasible. Each new
construct: extend grammar → add grammar `test/corpus` case → rebuild wasm →
extend adapter → add golden sample → green. Push grammar changes upstream.

## VS Code extension & packaging

- Remove kernel-related settings from extension config + JSON schema + README
  (`wolfram.enginePath`, `wolfram.systemKernel`, `wolframCSTRequestTimeoutMs`,
  etc.) and any kernel status/diagnostic UI.
- Bundle `tree-sitter-wolfram.wasm` (and the `web-tree-sitter` runtime wasm) in
  the vsix; ensure they load from the packaged extension path.
- `package.json`: drop `node-addon-api` dep and `build:addon` script; add
  `build:grammar`; update `files` to ship `src/parser/**` (incl. wasm) and drop
  kernel scripts; remove `wstp-addon/` from packaging.
- Update top-level README to remove the Wolfram Engine / kernel requirement and
  document the new zero-dependency runtime.

## Phased implementation plan

- **Phase 0 — Spike / contract verification.** Stand up `web-tree-sitter` loading
  a committed wasm in a test; determine whether the translator needs whitespace
  leaves; re-capture the 18 existing fixtures via kernel and confirm they match
  the committed JSON (validates the capture script). Freeze the adapter contract.
- **Phase 1 — Golden corpus + capture harness.** `scripts/capture-golden.mjs`;
  seed `tests/golden/` from existing `.wl` files + Tier-1 construct files.
- **Phase 2 — Adapter core (TDD vs golden CST).** Implement `adapter.js` for
  Tier-1 constructs; iterate construct-by-construct until CSTs match.
- **Phase 3 — Runtime integration + removal.** `src/parser/index.js`; wire into
  `src/index.js`; error/fallback path; delete the kernel stack and its tests;
  make `formatted-output.test.js` kernel-free.
- **Phase 4 — Grammar extension.** Add Tier-1 gap rules upstream; rebuild wasm;
  extend adapter + golden samples in lockstep.
- **Phase 5 — VS Code extension + packaging.** Remove kernel config/UI; bundle
  wasm; update `package.json`/`files`/README.
- **Phase 6 — Final equivalence sweep.** Whole corpus byte-identical to golden
  output; full suite green; idempotency holds.

## Risks

- **Grammar quality:** tree-sitter GLR may emit `ERROR` on valid input the
  current grammar's `prec` rules don't disambiguate. Mitigated by Tier-3 fallback
  and upstream grammar fixes.
- **Position semantics:** web-tree-sitter columns are UTF-16-based; CodeParser
  cols are char-based. Adapter converts via source text to stay exact on
  multibyte input.
- **Comment placement fidelity:** extras attach between siblings; matching
  CodeParser's exact inline placement may need care. Golden CSTs pin the target.
- **Intricate CST shapes** (patterns, parts, spans, derivatives): defined by
  golden capture, not guessed.
- **LongName long tail:** Tier-3 graceful degradation rather than full coverage
  up front.

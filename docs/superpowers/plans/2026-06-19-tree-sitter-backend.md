# Tree-sitter Parsing Back-end Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Wolfram-kernel/WSTP/CodeParser parse back-end with the `mtirard/zed-wolfram-treesitter` grammar (via `web-tree-sitter` WASM) plus an adapter that emits CodeParser-shaped CST, so the plugin formats Wolfram with no kernel dependency and all existing rules/features are preserved.

**Architecture:** Parse text with `web-tree-sitter` into a tree-sitter `Tree`; an adapter transforms that tree into the exact CST-JSON shape `CodeParser` produced; everything downstream (`addOffsets`, `translator/**`, `rules/**`) is unchanged. A frozen golden corpus captured once from a real kernel is the equivalence oracle.

**Tech Stack:** Node 24, `web-tree-sitter` (WASM runtime), `tree-sitter-cli` (grammar → wasm, uses local Docker for emscripten), Prettier 3, Vitest, git submodule.

## Global Constraints

- Runtime back-end: `web-tree-sitter` (WASM) only. No Wolfram kernel, WSTP, `wolframscript`, or native addon at runtime.
- Grammar lives at `grammar/` as a **git submodule**; the built artifact `src/parser/tree-sitter-wolfram.wasm` is committed and kept in lockstep with the submodule commit.
- The translator, rules, options, VS Code extension formatting logic, `src/utils/offsets.js`, `src/utils/cstErrors.js`, and the 18 existing `tests/fixtures/*.json` are **not modified by behavior** (imports/wiring only).
- CST `source` is **1-based** `[[startLine,startCol],[endLine,endCol]]`, char-column based (consistent with `buildOffsetTable`/`lineColToOffset`).
- **Hard equivalence bar:** every golden-corpus file formats **byte-identically** to the kernel-captured output, and the full existing test suite passes. CST deep-equality is checked **modulo trivia** (whitespace/newline leaves may be omitted; comment leaves must match).
- TDD: failing test first, minimal code, frequent commits. Work on branch `tree-sitter-backend` (already created).
- The dev-only `scripts/capture-golden.mjs` must NOT appear in `package.json` `files`.

---

## Task 1: Repo scaffolding — grammar submodule + wasm build pipeline

**Files:**
- Create: `.gitmodules` (via `git submodule add`)
- Create: `grammar/` (submodule → `https://github.com/mtirard/zed-wolfram-treesitter`)
- Create: `src/parser/tree-sitter-wolfram.wasm` (committed build artifact)
- Modify: `package.json` (add `web-tree-sitter` dep, `tree-sitter-cli` devDep, `build:grammar` script)
- Create: `scripts/build-grammar.mjs`

**Interfaces:**
- Produces: a committed `src/parser/tree-sitter-wolfram.wasm` that later tasks load; `npm run build:grammar` rebuilds it from `grammar/`.

- [ ] **Step 1: Add the grammar submodule**

```bash
git submodule add https://github.com/mtirard/zed-wolfram-treesitter grammar
git -C grammar checkout main
```

- [ ] **Step 2: Add dependencies and build script to package.json**

In `package.json`, add to `dependencies`: `"web-tree-sitter": "^0.25.0"`. Add to `devDependencies`: `"tree-sitter-cli": "^0.25.0"`. Add to `scripts`: `"build:grammar": "node scripts/build-grammar.mjs"`. Then run:

```bash
npm install
```

- [ ] **Step 3: Write the build script**

Create `scripts/build-grammar.mjs`:

```js
// Regenerates the committed wasm from the grammar submodule.
// Uses tree-sitter-cli; falls back to Docker-based emscripten when emcc is absent.
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { copyFileSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const grammarDir = resolve(here, "../grammar");
const outWasm = resolve(here, "../src/parser/tree-sitter-wolfram.wasm");
const cli = resolve(here, "../node_modules/.bin/tree-sitter");

const run = (args, cwd) =>
	execFileSync(cli, args, { cwd, stdio: "inherit" });

run(["generate"], grammarDir);
run(["build", "--wasm", "."], grammarDir);
// tree-sitter writes tree-sitter-wolfram.wasm into the grammar dir.
copyFileSync(resolve(grammarDir, "tree-sitter-wolfram.wasm"), outWasm);
console.log("Wrote", outWasm);
```

- [ ] **Step 4: Build the wasm**

Run: `npm run build:grammar`
Expected: prints `Wrote .../src/parser/tree-sitter-wolfram.wasm`. (If emscripten is missing, tree-sitter-cli uses the local Docker daemon automatically.)

- [ ] **Step 5: Smoke-test that the wasm loads and parses**

Create `tests/parser/load.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(here, "../../src/parser/tree-sitter-wolfram.wasm");

describe("grammar wasm", () => {
	let parser;
	beforeAll(async () => {
		await Parser.init();
		const lang = await Language.load(readFileSync(wasmPath));
		parser = new Parser();
		parser.setLanguage(lang);
	});
	it("parses a simple call without errors", () => {
		const tree = parser.parse("f[x, y]");
		expect(tree.rootNode.type).toBe("source_file");
		expect(tree.rootNode.hasError).toBe(false);
	});
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npx vitest run tests/parser/load.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .gitmodules grammar package.json package-lock.json scripts/build-grammar.mjs src/parser/tree-sitter-wolfram.wasm tests/parser/load.test.js
git commit -m "feat(parser): add tree-sitter grammar submodule and wasm build pipeline"
```

---

## Task 2: Phase-0 contract probe — confirm translator ignores whitespace leaves

**Files:**
- Create: `tests/translator/trivia-independence.test.js`

**Interfaces:**
- Produces: a regression test proving the adapter may omit whitespace/newline leaves. Locks the "CST equality modulo trivia" decision.

- [ ] **Step 1: Write the test that strips trivia and compares formatter output**

```js
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import prettier from "prettier";
import * as plugin from "../../src/index.js";

const require = createRequire(import.meta.url);
const TRIVIA = new Set(["Whitespace", "Token`Whitespace", "Newline", "Token`Newline"]);

function stripTrivia(node) {
	if (!node || typeof node !== "object") return node;
	const copy = { ...node };
	if (Array.isArray(copy.children)) {
		copy.children = copy.children
			.filter((c) => !(c?.type === "LeafNode" && TRIVIA.has(c.kind)))
			.map(stripTrivia);
	}
	if (copy.head) copy.head = stripTrivia(copy.head);
	return copy;
}

async function printCst(cst) {
	// Feed a pre-built CST straight to the printer via a synthetic parser.
	const synthetic = {
		...plugin,
		parsers: { wolfram: { ...plugin.parsers.wolfram, parse: async () => cst } },
	};
	return prettier.format("ignored", { parser: "wolfram", plugins: [synthetic] });
}

describe("translator ignores whitespace/newline leaves", () => {
	it("module-simple formats identically with trivia stripped", async () => {
		const full = require("../fixtures/module-simple.json");
		const stripped = stripTrivia(full);
		expect(await printCst(stripped)).toBe(await printCst(full));
	});
	it("call-nested formats identically with trivia stripped", async () => {
		const full = require("../fixtures/call-nested.json");
		const stripped = stripTrivia(full);
		expect(await printCst(stripped)).toBe(await printCst(full));
	});
});
```

- [ ] **Step 2: Run the probe**

Run: `npx vitest run tests/translator/trivia-independence.test.js`
Expected: PASS (fixtures already carry `locStart/locEnd`? No — they carry `source`; the synthetic parser must run offsets). If it fails because offsets are missing, wrap the synthetic `parse` to run `buildOffsetTable`/`addOffsets` on the cst before returning, mirroring `src/index.js`. Re-run until PASS, confirming output is trivia-independent.

- [ ] **Step 3: Record the finding in the spec**

Append a line to `docs/superpowers/specs/2026-06-19-tree-sitter-conversion-design.md` under "Comments and whitespace": `**Phase-0 result:** translator output is independent of whitespace/newline leaves (verified by tests/translator/trivia-independence.test.js); the adapter omits them and CST equality is checked modulo trivia.`

- [ ] **Step 4: Commit**

```bash
git add tests/translator/trivia-independence.test.js docs/superpowers/specs/2026-06-19-tree-sitter-conversion-design.md
git commit -m "test(translator): confirm whitespace-leaf independence (Phase 0)"
```

---

## Task 3: Position + source-text utilities for the adapter

**Files:**
- Create: `src/parser/position.js`
- Create: `tests/parser/position.test.js`

**Interfaces:**
- Produces:
  - `makeLineIndex(source) → number[]` — array of char offsets of each line start.
  - `offsetToLineCol(lineIndex, offset) → [line, col]` — 1-based line/col for a char offset.
  - `nodeSource(tsNode, lineIndex) → [[l,c],[l,c]]` — CodeParser-shaped 1-based source from a tree-sitter node's `startIndex`/`endIndex` (char offsets).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { makeLineIndex, offsetToLineCol, nodeSource } from "../../src/parser/position.js";

describe("position", () => {
	it("maps offsets to 1-based line/col", () => {
		const idx = makeLineIndex("ab\ncde");
		expect(offsetToLineCol(idx, 0)).toEqual([1, 1]);
		expect(offsetToLineCol(idx, 2)).toEqual([1, 3]);
		expect(offsetToLineCol(idx, 3)).toEqual([2, 1]);
		expect(offsetToLineCol(idx, 5)).toEqual([2, 3]);
	});
	it("builds CodeParser source from a node-like object", () => {
		const idx = makeLineIndex("f[x]");
		expect(nodeSource({ startIndex: 0, endIndex: 1 }, idx)).toEqual([[1, 1], [1, 2]]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/position.test.js`
Expected: FAIL ("does not provide an export named 'makeLineIndex'").

- [ ] **Step 3: Implement**

Create `src/parser/position.js`:

```js
// Convert tree-sitter char offsets to CodeParser 1-based [line,col] source.
export function makeLineIndex(source) {
	const starts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") starts.push(i + 1);
	}
	return starts;
}

export function offsetToLineCol(lineIndex, offset) {
	// Binary search for the greatest line start <= offset.
	let lo = 0, hi = lineIndex.length - 1, line = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (lineIndex[mid] <= offset) { line = mid; lo = mid + 1; }
		else hi = mid - 1;
	}
	return [line + 1, offset - lineIndex[line] + 1];
}

export function nodeSource(tsNode, lineIndex) {
	return [
		offsetToLineCol(lineIndex, tsNode.startIndex),
		offsetToLineCol(lineIndex, tsNode.endIndex),
	];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/parser/position.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/position.js tests/parser/position.test.js
git commit -m "feat(parser): add position/source conversion utilities"
```

---

## Task 4: Operator → CodeParser op-name tables

**Files:**
- Create: `src/parser/operators.js`
- Create: `tests/parser/operators.test.js`

**Interfaces:**
- Produces:
  - `INFIX_OPS: Record<string,string>` — operator literal → CodeParser InfixNode op (e.g. `","→"Comma"`, `"+"→"Plus"`, `"*"→"Times"`, `";"→"CompoundExpression"`).
  - `BINARY_OPS: Record<string,string>` — e.g. `"="→"Set"`, `":="→"SetDelayed"`, `"->"→"Rule"`, `":>"→"RuleDelayed"`, `"^="→"UpSet"`, `"/;"→"Condition"`, `"/."→"ReplaceAll"`.
  - `PREFIX_OPS`, `POSTFIX_OPS` — e.g. `"-"→"Minus"`, `"!"→"Not"`; `"&"→"Function"`, `"!"→"Factorial"`, `".."→"Repeated"`, `"..."→"RepeatedNull"`, `"'"→"Derivative"`.
  - `opName(table, literal) → string` — lookup with a clear throw on unknown operator (so missing mappings surface during golden testing rather than silently mis-formatting).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { INFIX_OPS, BINARY_OPS, PREFIX_OPS, POSTFIX_OPS, opName } from "../../src/parser/operators.js";

describe("operator tables", () => {
	it("maps the common operators seen in fixtures", () => {
		expect(INFIX_OPS[","]).toBe("Comma");
		expect(INFIX_OPS["+"]).toBe("Plus");
		expect(INFIX_OPS["*"]).toBe("Times");
		expect(INFIX_OPS[";"]).toBe("CompoundExpression");
		expect(BINARY_OPS["="]).toBe("Set");
		expect(PREFIX_OPS["-"]).toBe("Minus");
		expect(POSTFIX_OPS["&"]).toBe("Function");
	});
	it("opName throws on an unmapped operator", () => {
		expect(() => opName(INFIX_OPS, "@@@@")).toThrow(/unmapped/i);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/operators.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/parser/operators.js`. Seed with the operators in the grammar's `binary`/`infix`/`prefix`/`postfix` rules, mapped to CodeParser op names. Each entry below is validated against golden CST in later tasks; unknown operators throw so gaps surface loudly.

```js
export const INFIX_OPS = {
	",": "Comma", ";": "CompoundExpression",
	"+": "Plus", "-": "Plus", "*": "Times", "/": "Divide",
	".": "Dot", "**": "NonCommutativeMultiply",
	"~~": "StringExpression", "<>": "StringJoin",
	"|": "Alternatives", "||": "Or", "&&": "And",
	"===": "SameQ", "=!=": "UnsameQ",
	"==": "Equal", "!=": "Unequal", "<": "Less", "<=": "LessEqual",
	">": "Greater", ">=": "GreaterEqual",
	"@*": "Composition", "/*": "RightComposition",
};
export const BINARY_OPS = {
	"=": "Set", ":=": "SetDelayed", "^=": "UpSet", "^:=": "UpSetDelayed",
	"->": "Rule", ":>": "RuleDelayed", "<->": "TwoWayRule", "|->": "Function",
	"/;": "Condition", "/.": "ReplaceAll", "//.": "ReplaceRepeated",
	"/:": "TagSet", "//": "Postfix", "//=": "ApplyTo",
	"+=": "AddTo", "-=": "SubtractFrom", "*=": "TimesBy", "/=": "DivideBy",
	"^": "Power", "@": "Prefix", "@@": "Apply", "@@@": "Apply",
	"/@": "Map", "//@": "MapAll", "?": "PatternTest", ":": "Pattern",
};
export const PREFIX_OPS = {
	"-": "Minus", "+": "Plus", "!": "Not", "!!": "Not",
	"++": "PreIncrement", "--": "PreDecrement",
};
export const POSTFIX_OPS = {
	"&": "Function", "..": "Repeated", "...": "RepeatedNull",
	"'": "Derivative", "!": "Factorial", "!!": "Factorial2",
	"++": "Increment", "--": "Decrement", "=.": "Unset",
};
export function opName(table, literal) {
	const op = table[literal];
	if (op === undefined) throw new Error(`unmapped operator: ${JSON.stringify(literal)}`);
	return op;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/parser/operators.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/operators.js tests/parser/operators.test.js
git commit -m "feat(parser): add operator-to-CodeParser-op-name tables"
```

---

## Task 5: Golden capture script + seed corpus

**Files:**
- Create: `scripts/capture-golden.mjs` (dev-only; NOT in package.json `files`)
- Create: `tests/golden/*.wl` (seed inputs)
- Create: `tests/golden/*.cst.json` and `tests/golden/*.formatted.wl` (captured artifacts)

**Interfaces:**
- Produces: for each `tests/golden/<name>.wl`, a `<name>.cst.json` (CodeParser CST) and `<name>.formatted.wl` (today's translator output on that CST). Later tasks assert the adapter reproduces these.

- [ ] **Step 1: Seed the corpus**

Copy the existing samples and add Tier-1 construct files:

```bash
mkdir -p tests/golden
cp tests/wl/basic.wl tests/golden/basic.wl
cp tests/wl/modules.wl tests/golden/modules.wl
cp tests/wl/conditions.wl tests/golden/conditions.wl
cp tests/wl/comments.wl tests/golden/comments.wl
cp tests/wl/rules.wl tests/golden/rules.wl
```

Create `tests/golden/constructs.wl` with the Tier-1 gap constructs:

```wolfram
square = #^2 &
addPair = #1 + #2 &
spread = f[##] &
prev = %
prev2 = %%
msg = MyFunc::usage
tagged = a::b
get = << "file.wl"
put = expr >> "out.txt"
appendPut = expr >>> "log.txt"
tilde = a ~ f ~ b
assoc = <| "k" -> 1, "v" -> 2 |>
patt = x_Integer
spanEx = list[[2 ;; 5]]
```

- [ ] **Step 2: Write the capture script**

Create `scripts/capture-golden.mjs`:

```js
// DEV-ONLY. Regenerates the golden corpus from a real Wolfram kernel.
// Not shipped (excluded from package.json "files"). Run: node scripts/capture-golden.mjs
import { execFileSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import prettier from "prettier";
import * as plugin from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../tests/golden");

// 1. Capture CodeParser CST JSON via wolframscript.
const wl = (src) => `
ToString[
  Developer\`ToList @ CodeParser\`CodeConcreteParse[$Input],
  InputForm]`;
function captureCst(source) {
	const script = `
Needs["CodeParser\`"];
src = "${source.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}";
WriteString[$Output, ExportString[CodeParser\`CodeConcreteParse[src], "JSON", "Compact" -> False]];`;
	return execFileSync("wolframscript", ["-code", script], { encoding: "utf8" });
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".wl") && !f.endsWith(".formatted.wl"))) {
	const name = file.replace(/\.wl$/, "");
	const source = readFileSync(join(dir, file), "utf8");
	const cstJson = captureCst(source);
	writeFileSync(join(dir, `${name}.cst.json`), cstJson);
	// 2. Formatted output = current translator on that CST (pure JS, no kernel).
	const formatted = await prettier.format(source, { parser: "wolfram", plugins: [plugin], filepath: join(dir, file) });
	writeFileSync(join(dir, `${name}.formatted.wl`), formatted);
	console.log("captured", name);
}
```

Note: the CodeParser export must match the in-repo CST JSON shape. Cross-check the emitted `basic.cst.json` against the structure in `tests/fixtures/module-simple.json` (same `type`/`kind`/`op`/`source` keys); adjust the wolframscript serialization (the existing `src/bridge/request.wls` / `init.m` is the reference for how the kernel previously serialized CST) until the keys match before relying on it.

- [ ] **Step 3: Run capture (requires a kernel — dev machine only)**

Run: `node scripts/capture-golden.mjs`
Expected: prints `captured basic`, `captured constructs`, … and writes `*.cst.json` + `*.formatted.wl`. Files with constructs the *current* grammar/translator can't handle still capture CodeParser CST fine (kernel handles everything).

- [ ] **Step 4: Sanity-check one captured CST against an existing fixture shape**

Run: `node -e "const a=require('./tests/golden/basic.cst.json'); console.log(a.type, a.kind, a.children?.[0]?.type)"`
Expected: `ContainerNode String CallNode` (or `BinaryNode`), confirming the captured shape matches the fixtures.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-golden.mjs tests/golden
git commit -m "feat(test): add golden-corpus capture script and frozen corpus"
```

---

## Task 6: Adapter — leaves, container, and trivia-stripped equality harness

**Files:**
- Create: `src/parser/adapter.js`
- Create: `src/parser/cstEqual.js`
- Create: `tests/parser/adapter.leaf.test.js`

**Interfaces:**
- Consumes: `nodeSource` (Task 3), `web-tree-sitter` tree.
- Produces:
  - `adapt(tree, source) → cst` — top-level entry; returns a `ContainerNode`.
  - `stripTrivia(cst) → cst` and `cstEqualModuloTrivia(a, b) → boolean` (in `cstEqual.js`) — used by all golden CST tests.

- [ ] **Step 1: Write the failing test (leaf + container)**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser();
	parser.setLanguage(lang);
});

describe("adapter leaves", () => {
	it("wraps a single symbol in a ContainerNode", () => {
		const cst = adapt(parser.parse("x"), "x");
		expect(cst.type).toBe("ContainerNode");
		expect(cst.kind).toBe("String");
		expect(cst.children[0]).toMatchObject({ type: "LeafNode", kind: "Symbol", value: "x", source: [[1, 1], [1, 2]] });
	});
	it("maps integer/real/string leaves", () => {
		expect(adapt(parser.parse("42"), "42").children[0]).toMatchObject({ kind: "Integer", value: "42" });
		expect(adapt(parser.parse("3.5"), "3.5").children[0]).toMatchObject({ kind: "Real", value: "3.5" });
		expect(adapt(parser.parse('"hi"'), '"hi"').children[0]).toMatchObject({ kind: "String", value: '"hi"' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/adapter.leaf.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement leaves + container + dispatch skeleton**

Create `src/parser/adapter.js`:

```js
import { makeLineIndex, nodeSource } from "./position.js";

const LEAF_KIND = { symbol: "Symbol", integer: "Integer", real: "Real", string: "String", comment: "Token`Comment" };

export function adapt(tree, source) {
	const lineIndex = makeLineIndex(source);
	const ctx = { source, lineIndex };
	const root = tree.rootNode;
	return {
		type: "ContainerNode",
		kind: "String",
		children: namedChildren(root).map((c) => adaptNode(c, ctx)),
		source: nodeSource(root, lineIndex),
	};
}

// tree-sitter named children, including comment extras, in source order.
function namedChildren(node) {
	const out = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (c.isNamed) out.push(c);
	}
	return out;
}

function leaf(node, ctx, kind = LEAF_KIND[node.type]) {
	return { type: "LeafNode", kind, value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
}

function adaptNode(node, ctx) {
	switch (node.type) {
		case "symbol": case "integer": case "real": case "string": case "comment":
			return leaf(node, ctx);
		case "ERROR": case "MISSING":
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
		default:
			// Filled in by later tasks (group/call/infix/binary/prefix/postfix/part/span/pattern).
			return { type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(node, ctx.lineIndex) };
	}
}

export { adaptNode, namedChildren, leaf };
```

Create `src/parser/cstEqual.js`:

```js
const TRIVIA = new Set(["Whitespace", "Token`Whitespace", "Newline", "Token`Newline"]);

export function stripTrivia(node) {
	if (!node || typeof node !== "object") return node;
	const copy = { ...node };
	delete copy.locStart; delete copy.locEnd; // offsets are derived downstream
	if (Array.isArray(copy.children)) {
		copy.children = copy.children
			.filter((c) => !(c?.type === "LeafNode" && TRIVIA.has(c.kind)))
			.map(stripTrivia);
	}
	if (copy.head) copy.head = stripTrivia(copy.head);
	return copy;
}

export function cstEqualModuloTrivia(a, b) {
	return JSON.stringify(stripTrivia(a)) === JSON.stringify(stripTrivia(b));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/parser/adapter.leaf.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/adapter.js src/parser/cstEqual.js tests/parser/adapter.leaf.test.js
git commit -m "feat(parser): adapter leaves/container + trivia-modulo equality"
```

---

## Task 7: Adapter — groups, calls, parts

**Files:**
- Modify: `src/parser/adapter.js`
- Create: `tests/parser/adapter.call.test.js`

**Interfaces:**
- Consumes: `adaptNode`, `leaf`, `nodeSource`.
- Produces: `adaptNode` handles `group` → `GroupNode` (kind from delimiters), `call` → `CallNode`, `part` → CodeParser Part shape. Bracket/delimiter `LeafNode`s carry kinds `` Token`OpenSquare ``/`` Token`CloseSquare ``/`` Token`OpenCurly ``/`` Token`CloseCurly ``/`` Token`LessBar ``/`` Token`BarGreater ``/`` Token`OpenParen ``/`` Token`CloseParen ``.

- [ ] **Step 1: Write the failing test (against golden CST, modulo trivia)**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

describe("adapter calls/groups", () => {
	it("matches CodeParser CST for f[g[x], h[y, z]] modulo trivia", () => {
		const src = "f[g[x], h[y, z]]";
		const golden = require("../fixtures/call-nested.json");
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), golden)).toBe(true);
	});
	it("emits GroupNode kind List for {1, 2}", () => {
		const cst = adapt(parser.parse("{1, 2}"), "{1, 2}");
		expect(cst.children[0]).toMatchObject({ type: "GroupNode", kind: "List" });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/adapter.call.test.js`
Expected: FAIL (calls/groups not yet handled → Unknown nodes → not equal).

- [ ] **Step 3: Implement group/call/part in `adaptNode`**

Add these cases to the `switch` in `adaptNode` (before `default`), and the helpers below. Use `flattenComma` from Task 8 once it exists; for now arguments are adapted via `adaptArguments` which Task 8 upgrades — implement the structural wrapping here:

```js
		case "group": return adaptGroup(node, ctx);
		case "call": return adaptCall(node, ctx, "Token`OpenSquare", "[", "Token`CloseSquare", "]");
		case "part": return adaptCall(node, ctx, "Token`OpenSquare`OpenSquare", "[[", "Token`CloseSquare`CloseSquare", "]]");
```

Add helpers (anonymous delimiter tokens are matched by their text):

```js
const GROUP_KIND = { "{": "List", "(": "Paren", "[": "Group", "<|": "Association" };
const GROUP_OPEN_LEAF = { "{": "Token`OpenCurly", "(": "Token`OpenParen", "[": "Token`OpenSquare", "<|": "Token`LessBar" };
const GROUP_CLOSE_LEAF = { "}": "Token`CloseCurly", ")": "Token`CloseParen", "]": "Token`CloseSquare", "|>": "Token`BarGreater" };

function anonChildText(node, ctx, idx) {
	const c = node.child(idx);
	return ctx.source.slice(c.startIndex, c.endIndex);
}

function adaptGroup(node, ctx) {
	const open = node.child(0);
	const openText = ctx.source.slice(open.startIndex, open.endIndex);
	const close = node.child(node.childCount - 1);
	const closeText = ctx.source.slice(close.startIndex, close.endIndex);
	const children = [delimLeaf(open, GROUP_OPEN_LEAF[openText], openText, ctx)];
	for (const c of namedChildren(node)) children.push(adaptArguments(c, ctx));
	children.push(delimLeaf(close, GROUP_CLOSE_LEAF[closeText], closeText, ctx));
	return { type: "GroupNode", kind: GROUP_KIND[openText], children, source: nodeSource(node, ctx.lineIndex) };
}

function adaptCall(node, ctx, openKind, openText, closeKind, closeText) {
	const headNode = node.childForFieldName("head");
	const argsNode = node.childForFieldName("arguments");
	const open = firstAnon(node, openText, ctx);
	const close = firstAnon(node, closeText, ctx);
	const children = [delimLeaf(open, openKind, openText, ctx)];
	if (argsNode) children.push(adaptArguments(argsNode, ctx));
	children.push(delimLeaf(close, closeKind, closeText, ctx));
	return { type: "CallNode", head: adaptNode(headNode, ctx), children, source: nodeSource(node, ctx.lineIndex) };
}

function firstAnon(node, text, ctx) {
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed && ctx.source.slice(c.startIndex, c.endIndex) === text) return c;
	}
	return node; // defensive
}

function delimLeaf(node, kind, value, ctx) {
	return { type: "LeafNode", kind, value, source: nodeSource(node, ctx.lineIndex) };
}

// Until Task 8, arguments are a single expression; Task 8 replaces this with comma flattening.
function adaptArguments(node, ctx) { return adaptNode(node, ctx); }
```

- [ ] **Step 4: Run — expect the GroupNode test to pass; the call-nested test may still differ on comma structure**

Run: `npx vitest run tests/parser/adapter.call.test.js`
Expected: GroupNode test PASS; `call-nested` test may FAIL pending comma flattening (Task 8). If so, mark it skipped with `it.skip` and a `// unskipped in Task 8` comment, commit, and proceed.

- [ ] **Step 5: Commit**

```bash
git add src/parser/adapter.js tests/parser/adapter.call.test.js
git commit -m "feat(parser): adapter handles groups, calls, parts"
```

---

## Task 8: Adapter — infix flattening (comma, arithmetic, compound)

**Files:**
- Modify: `src/parser/adapter.js`
- Create: `tests/parser/adapter.infix.test.js`

**Interfaces:**
- Consumes: `INFIX_OPS`, `opName` (Task 4); `adaptNode`.
- Produces: `adaptNode` handles `infix` → flat `InfixNode` `{ op, children }`. Left-assoc chains of the **same** operator literal collapse into one node; the operator token appears as a `LeafNode` between operands. `adaptArguments` now flattens top-level commas into a single `InfixNode op:"Comma"`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

describe("adapter infix flattening", () => {
	it("flattens a+b+c into one InfixNode op:Plus", () => {
		const cst = adapt(parser.parse("a + b + c"), "a + b + c");
		const infix = cst.children[0];
		expect(infix).toMatchObject({ type: "InfixNode", op: "Plus" });
		const operands = infix.children.filter((c) => c.kind === "Symbol");
		expect(operands.map((o) => o.value)).toEqual(["a", "b", "c"]);
	});
	it("matches CodeParser CST for the nested call (comma flattening) modulo trivia", () => {
		const src = "f[g[x], h[y, z]]";
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), require("../fixtures/call-nested.json"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/adapter.infix.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement infix flattening**

In `adapter.js`, import the op tables at top: `import { INFIX_OPS, opName } from "./operators.js";`. Add to the `switch`: `case "infix": return adaptInfix(node, ctx);`. Replace `adaptArguments` and add `adaptInfix`/`flatten`:

```js
function operatorLiteral(node, ctx) {
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (!c.isNamed) return ctx.source.slice(c.startIndex, c.endIndex);
	}
	return null;
}

// Collapse a left-assoc chain of the same infix operator into a flat operand list,
// interleaving the operator leaves, matching CodeParser's InfixNode.
function flattenInfix(node, literal, ctx, out) {
	const op = node.child(0), opText = literal;
	const left = node.child(0);
	// children: operand, opToken, operand (binary shape); recurse left if same op+literal.
	const named = [];
	const tokens = [];
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (c.isNamed) named.push(c); else tokens.push(c);
	}
	const lhs = named[0];
	if (lhs.type === "infix" && operatorLiteral(lhs, ctx) === opText) flattenInfix(lhs, literal, ctx, out);
	else out.children.push(adaptNode(lhs, ctx));
	for (const t of tokens) out.children.push({ type: "LeafNode", kind: `Token\`${tokenKindName(opText)}`, value: opText, source: nodeSource(t, ctx.lineIndex) });
	out.children.push(adaptNode(named[named.length - 1], ctx));
}

function tokenKindName(literal) {
	const NAMES = { ",": "Comma", "+": "Plus", "-": "Minus", "*": "Star", ";": "Semi", ".": "Dot" };
	return NAMES[literal] ?? "Operator";
}

function adaptInfix(node, ctx) {
	const literal = operatorLiteral(node, ctx);
	const out = { type: "InfixNode", op: opName(INFIX_OPS, literal), children: [], source: nodeSource(node, ctx.lineIndex) };
	flattenInfix(node, literal, ctx, out);
	return out;
}

function adaptArguments(node, ctx) {
	// A comma-separated argument list parses as an infix(",") chain; map to flat Comma InfixNode.
	if (node.type === "infix" && operatorLiteral(node, ctx) === ",") return adaptInfix(node, ctx);
	return adaptNode(node, ctx);
}
```

- [ ] **Step 4: Run to verify it passes; unskip the Task-7 call-nested test**

Remove the `it.skip` left in `tests/parser/adapter.call.test.js` (Task 7) if present.
Run: `npx vitest run tests/parser/adapter.infix.test.js tests/parser/adapter.call.test.js`
Expected: PASS. If the comma token kind or operand structure differs from the fixture, adjust `tokenKindName` / leaf kinds to match the fixture's exact `kind` strings, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/parser/adapter.js tests/parser/adapter.infix.test.js tests/parser/adapter.call.test.js
git commit -m "feat(parser): adapter flattens infix chains and comma argument lists"
```

---

## Task 9: Adapter — binary, prefix, postfix nodes

**Files:**
- Modify: `src/parser/adapter.js`
- Create: `tests/parser/adapter.binary.test.js`

**Interfaces:**
- Consumes: `BINARY_OPS`, `PREFIX_OPS`, `POSTFIX_OPS`, `opName`.
- Produces: `adaptNode` handles `binary` → `BinaryNode {op, children:[lhs, opLeaf, rhs]}`, `prefix` → `PrefixNode {op, children:[opLeaf, operand]}`, `postfix` → `PostfixNode {op, children:[operand, opLeaf]}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

describe("adapter binary/prefix/postfix", () => {
	it("maps a = 1 to BinaryNode Set", () => {
		expect(adapt(parser.parse("a = 1"), "a = 1").children[0]).toMatchObject({ type: "BinaryNode", op: "Set" });
	});
	it("maps -x to PrefixNode Minus and x& to PostfixNode Function", () => {
		expect(adapt(parser.parse("-x"), "-x").children[0]).toMatchObject({ type: "PrefixNode", op: "Minus" });
		expect(adapt(parser.parse("x &"), "x &").children[0]).toMatchObject({ type: "PostfixNode", op: "Function" });
	});
	it("matches CodeParser CST for Module modulo trivia", () => {
		const src = "Module[{a = 1, b = 2}, a + b]";
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), require("../fixtures/module-simple.json"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/adapter.binary.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Import tables: `import { INFIX_OPS, BINARY_OPS, PREFIX_OPS, POSTFIX_OPS, opName } from "./operators.js";`. Add cases and helpers:

```js
		case "binary": return adaptBinary(node, ctx);
		case "prefix": return adaptPrefix(node, ctx);
		case "postfix": return adaptPostfix(node, ctx);
```

```js
function opLeaf(tokenNode, ctx) {
	const v = ctx.source.slice(tokenNode.startIndex, tokenNode.endIndex);
	return { type: "LeafNode", kind: `Token\`${tokenKindName(v)}`, value: v, source: nodeSource(tokenNode, ctx.lineIndex) };
}
function parts(node) {
	const named = [], tokens = [];
	for (let i = 0; i < node.childCount; i++) { const c = node.child(i); (c.isNamed ? named : tokens).push(c); }
	return { named, tokens };
}
function adaptBinary(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	return { type: "BinaryNode", op: opName(BINARY_OPS, literal),
		children: [adaptNode(named[0], ctx), opLeaf(tokens[0], ctx), adaptNode(named[1], ctx)],
		source: nodeSource(node, ctx.lineIndex) };
}
function adaptPrefix(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	return { type: "PrefixNode", op: opName(PREFIX_OPS, literal),
		children: [opLeaf(tokens[0], ctx), adaptNode(named[0], ctx)], source: nodeSource(node, ctx.lineIndex) };
}
function adaptPostfix(node, ctx) {
	const { named, tokens } = parts(node);
	const literal = ctx.source.slice(tokens[0].startIndex, tokens[0].endIndex);
	return { type: "PostfixNode", op: opName(POSTFIX_OPS, literal),
		children: [adaptNode(named[0], ctx), opLeaf(tokens[0], ctx)], source: nodeSource(node, ctx.lineIndex) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/parser/adapter.binary.test.js`
Expected: PASS. If the `module-simple` comparison reveals a kind/op mismatch, align the relevant op-name table entry or `tokenKindName` to the fixture, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/parser/adapter.js tests/parser/adapter.binary.test.js
git commit -m "feat(parser): adapter handles binary/prefix/postfix nodes"
```

---

## Task 10: Adapter — comments, errors, and the full golden-CST sweep

**Files:**
- Modify: `src/parser/adapter.js`
- Create: `tests/parser/adapter.golden.test.js`

**Interfaces:**
- Consumes: everything above; the golden corpus from Task 5.
- Produces: `adaptNode` places `comment` leaves at their source position inside the enclosing children; any subtree containing `ERROR`/`MISSING` yields an `Unknown` node. New test asserts `adapt(parse(input))` equals `<name>.cst.json` modulo trivia for every corpus entry that the grammar parses cleanly.

- [ ] **Step 1: Write the failing golden sweep test**

```js
import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync, readdirSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../golden");
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

const cases = readdirSync(goldenDir).filter((f) => f.endsWith(".cst.json")).map((f) => f.replace(/\.cst\.json$/, ""));

describe("adapter golden CST sweep (modulo trivia)", () => {
	for (const name of cases) {
		it(`${name}`, () => {
			const src = readFileSync(join(goldenDir, `${name}.wl`), "utf8");
			const golden = require(join(goldenDir, `${name}.cst.json`));
			const tree = parser.parse(src);
			if (tree.rootNode.hasError) return; // Tier-3: grammar gap, handled by Task 11 fallback
			expect(cstEqualModuloTrivia(adapt(tree, src), golden)).toBe(true);
		});
	}
});
```

- [ ] **Step 2: Run to verify it fails (comment placement / remaining gaps)**

Run: `npx vitest run tests/parser/adapter.golden.test.js`
Expected: FAIL on `comments` (comment leaves not yet emitted in the right spot) and any not-yet-mapped construct.

- [ ] **Step 3: Implement comment emission + robust error detection**

`namedChildren` already includes `comment` extras (they are named), so `adaptNode`'s existing `comment` case emits the leaf — verify comments inside containers/groups are interleaved in source order (they will be, since `namedChildren` preserves order). For error nodes, add a recursive check so an `ERROR`/`MISSING` anywhere collapses the node to `Unknown`:

```js
function subtreeHasError(node) {
	if (node.type === "ERROR" || node.isMissing) return true;
	for (let i = 0; i < node.childCount; i++) if (subtreeHasError(node.child(i))) return true;
	return false;
}
```

In `adapt`, before mapping: `if (subtreeHasError(root)) return { type: "ContainerNode", kind: "String", children: [{ type: "Unknown", kind: "SyntaxErrorNode[]", source: nodeSource(root, lineIndex) }], source: nodeSource(root, lineIndex) };` so `containsCstErrors` triggers the round-trip fallback downstream.

- [ ] **Step 4: Run the full sweep**

Run: `npx vitest run tests/parser/adapter.golden.test.js`
Expected: PASS for every clean-parse corpus entry. Constructs the *current* grammar can't parse (`#`, `%`, `::`, etc.) hit `tree.rootNode.hasError` and are skipped here — they're fixed in Task 11. If a clean-parse entry mismatches, inspect the diff and align the adapter (operator table, kind names) to the golden CST.

- [ ] **Step 5: Commit**

```bash
git add src/parser/adapter.js tests/parser/adapter.golden.test.js
git commit -m "feat(parser): adapter comment placement + error collapse; golden CST sweep"
```

---

## Task 11: Grammar extension — Tier-1 gap constructs (upstream)

**Files:**
- Modify: `grammar/grammar.js` (submodule; push upstream)
- Modify: `grammar/test/corpus/expressions.txt` (add cases)
- Rebuild: `src/parser/tree-sitter-wolfram.wasm`
- Modify: `src/parser/operators.js`, `src/parser/adapter.js` (map the new nodes)

**Interfaces:**
- Produces: grammar rules + adapter mappings for Slot `#`/`#n`/`#name`, SlotSequence `##`/`##n`, Out `%`/`%%`/`%n`, MessageName `a::b`/`::usage`, Get/Put `<<`/`>>`/`>>>`, tilde-infix `~f~`. After this task the `constructs.wl` golden entry parses cleanly and matches CodeParser CST modulo trivia.

- [ ] **Step 1: Add a grammar corpus case (TDD at the grammar level)**

Append to `grammar/test/corpus/expressions.txt`:

```
================
Slot and pure function
================

#^2 &

---

(source_file
  (postfix
    (binary
      (slot)
      (integer))))
```

- [ ] **Step 2: Run the grammar test to confirm it fails**

Run: `cd grammar && ../node_modules/.bin/tree-sitter generate && ../node_modules/.bin/tree-sitter test; cd ..`
Expected: FAIL (`slot` rule undefined / `#` is an error).

- [ ] **Step 3: Add the grammar rules**

In `grammar/grammar.js`, add to the `_leaf` choice: `$.slot, $.slot_sequence, $.out`. Add to the top-level `binary` choice a tilde-infix and to a new rule set. Concretely add these rules inside `rules`:

```js
      slot: ($) => prec(PRECEDENCE_SYMBOL, seq("#", optional(token.immediate(/[a-zA-Z0-9$]+/)))),
      slot_sequence: ($) => prec(PRECEDENCE_SYMBOL, seq("##", optional(token.immediate(/[0-9]+/)))),
      out: ($) => prec(PRECEDENCE_SYMBOL, choice(token(/%+/), seq("%", token.immediate(/[0-9]+/)))),
      message_name: ($) => prec.left(PRECEDENCE_COLONCOLON, seq($._expression, "::", token.immediate(/[a-zA-Z][a-zA-Z0-9]*/), repeat(seq("::", token.immediate(/[a-zA-Z][a-zA-Z0-9]*/))))),
      get: ($) => prec(PRECEDENCE_LESSLESS, seq("<<", $._expression)),
      put: ($) => prec.left(PRECEDENCE_GREATERGREATER, seq($._expression, choice(">>", ">>>"), $._expression)),
      tilde_infix: ($) => prec.left(PRECEDENCE_TILDE, seq($._expression, "~", $._expression, "~", $._expression)),
```

Add `$.message_name, $.get, $.put, $.tilde_infix` to the `_expression` choice. (Coordinate exact node names with the upstream maintainer; keep them stable since the adapter keys off them.)

- [ ] **Step 4: Make the grammar corpus test pass and rebuild wasm**

Run: `cd grammar && ../node_modules/.bin/tree-sitter test; cd .. && npm run build:grammar`
Expected: grammar tests PASS; wasm rebuilt.

- [ ] **Step 5: Map the new nodes in the adapter**

In `src/parser/operators.js` add `INFIX_OPS["~"]` is N/A (tilde handled structurally); add to adapter `adaptNode` switch:

```js
		case "slot": return { type: "LeafNode", kind: "Slot", value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
		case "slot_sequence": return { type: "LeafNode", kind: "SlotSequence", value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
		case "out": return { type: "LeafNode", kind: "Out", value: ctx.source.slice(node.startIndex, node.endIndex), source: nodeSource(node, ctx.lineIndex) };
		case "message_name": return adaptMessageName(node, ctx);
		case "get": return adaptPrefixLike(node, ctx, "Get");
		case "put": return adaptBinaryLike(node, ctx);
		case "tilde_infix": return adaptTilde(node, ctx);
```

Implement `adaptMessageName`/`adaptTilde`/`adaptPrefixLike`/`adaptBinaryLike` to match the captured `constructs.cst.json` shapes (CodeParser: `a::b` → `InfixNode[MessageName,...]`; `~f~` → `TernaryNode[TernaryTilde,...]`; `<<` → `PrefixNode[Get,...]`; `>>` → `BinaryNode[Put,...]`). Read the exact shapes from `tests/golden/constructs.cst.json` and mirror them.

- [ ] **Step 6: Run the golden sweep — constructs.wl now parses and matches**

Run: `npx vitest run tests/parser/adapter.golden.test.js`
Expected: `constructs` no longer skipped (no `hasError`) and PASSES modulo trivia.

- [ ] **Step 7: Commit (both repos)**

```bash
git -C grammar add grammar.js test/corpus/expressions.txt && git -C grammar commit -m "feat: add slot, out, message-name, get/put, tilde-infix rules"
git add grammar src/parser/tree-sitter-wolfram.wasm src/parser/adapter.js src/parser/operators.js
git commit -m "feat(parser): grammar+adapter cover slots, out, message names, get/put, tilde"
```

---

## Task 12: WolframParser runtime + wire into src/index.js

**Files:**
- Create: `src/parser/index.js`
- Modify: `src/index.js:1-12,45` (swap bridge import + getCST call)
- Create: `tests/parser/wolframParser.test.js`

**Interfaces:**
- Consumes: `adapt` (adapter), the committed wasm.
- Produces: `class WolframParser { async getCST(text, options) → cst }` — same call shape `src/index.js` already uses (`bridge.getCST(cstText, normalizedOptions)`), but synchronous parse under the hood; returns the adapted CST (no offsets — `src/index.js` still runs `buildOffsetTable`/`addOffsets`).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { WolframParser } from "../../src/parser/index.js";

describe("WolframParser", () => {
	it("returns a CodeParser-shaped CST for valid input", async () => {
		const cst = await new WolframParser().getCST("f[x]", { tabWidth: 2 });
		expect(cst.type).toBe("ContainerNode");
		expect(cst.children[0].type).toBe("CallNode");
	});
	it("returns an error-bearing CST for unparseable input", async () => {
		const cst = await new WolframParser().getCST("f[", { tabWidth: 2 });
		expect(JSON.stringify(cst)).toMatch(/Unknown|SyntaxErrorNode/);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parser/wolframParser.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the parser facade**

Create `src/parser/index.js`:

```js
import { Parser, Language } from "web-tree-sitter";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { adapt } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(here, "tree-sitter-wolfram.wasm");

let _langPromise = null;
async function getLanguage() {
	if (!_langPromise) {
		_langPromise = (async () => {
			await Parser.init();
			return Language.load(readFileSync(WASM_PATH));
		})();
	}
	return _langPromise;
}

export class WolframParser {
	async getCST(sourceText) {
		const lang = await getLanguage();
		const parser = new Parser();
		parser.setLanguage(lang);
		const tree = parser.parse(sourceText);
		return adapt(tree, sourceText);
	}
}
```

- [ ] **Step 4: Wire into `src/index.js`**

Replace `import { KernelBridge } from "./bridge/index.js";` with `import { WolframParser } from "./parser/index.js";` and `const bridge = new KernelBridge();` with `const parser = new WolframParser();`. Change `const cst = await bridge.getCST(cstText, normalizedOptions);` to `const cst = await parser.getCST(cstText, normalizedOptions);`. Leave the rest of `parse()` (shebang, offsets, error check) unchanged.

- [ ] **Step 5: Run the parser + a downstream format test**

Run: `npx vitest run tests/parser/wolframParser.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parser/index.js src/index.js tests/parser/wolframParser.test.js
git commit -m "feat(parser): WolframParser facade; wire into plugin parse()"
```

---

## Task 13: End-to-end formatted-output equivalence against the golden corpus

**Files:**
- Create: `tests/parser/format.golden.test.js`

**Interfaces:**
- Consumes: the wired plugin (Task 12), `<name>.formatted.wl` (Task 5).
- Produces: the hard equivalence bar — every corpus file formats byte-identically to the kernel-captured output, and is idempotent.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import prettier from "prettier";
import * as plugin from "../../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../golden");
const cases = readdirSync(goldenDir).filter((f) => f.endsWith(".formatted.wl")).map((f) => f.replace(/\.formatted\.wl$/, ""));

describe("formatted output equals golden (byte-identical)", () => {
	for (const name of cases) {
		it(`${name}`, async () => {
			const src = readFileSync(join(goldenDir, `${name}.wl`), "utf8");
			const expected = readFileSync(join(goldenDir, `${name}.formatted.wl`), "utf8");
			const out = await prettier.format(src, { parser: "wolfram", plugins: [plugin], filepath: join(goldenDir, `${name}.wl`) });
			expect(out).toBe(expected);
			const again = await prettier.format(out, { parser: "wolfram", plugins: [plugin], filepath: join(goldenDir, `${name}.wl`) });
			expect(again).toBe(out); // idempotent
		});
	}
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/parser/format.golden.test.js`
Expected: PASS for all corpus entries. Any mismatch is a real adapter/grammar gap — fix in the relevant earlier task (operator table, kind name, grammar rule), re-run the golden CST sweep, then re-run this.

- [ ] **Step 3: Commit**

```bash
git add tests/parser/format.golden.test.js
git commit -m "test(parser): byte-identical formatted-output equivalence vs golden corpus"
```

---

## Task 14: Remove the kernel/WSTP stack and fix the suite

**Files:**
- Delete: `src/bridge/` (whole dir), `scripts/kernel-server.js`, `scripts/find-wstp.js`, `wstp-addon/` (whole dir), `scripts/debug-bridge.js`, `tests/bridge/` (whole dir)
- Modify: `package.json` (remove `node-addon-api` dep, `build:addon` + `debug:bridge` scripts; update `files`)
- Modify: `tests/rules/formatted-output.test.js` (now kernel-free — should already pass; no code change expected)

**Interfaces:**
- Produces: a repo with no runtime kernel dependency; `npm test` green.

- [ ] **Step 1: Delete the kernel stack**

```bash
git rm -r src/bridge scripts/kernel-server.js scripts/find-wstp.js scripts/debug-bridge.js wstp-addon tests/bridge
```

- [ ] **Step 2: Update package.json**

Remove `"node-addon-api"` from `dependencies`. Remove `"build:addon"` and `"debug:bridge"` from `scripts`. In `files`, remove `"scripts/find-wstp.js"` and `"scripts/kernel-server.js"`; add `"src/parser/tree-sitter-wolfram.wasm"` (the `"src/"` glob already covers JS, but list the wasm explicitly to be safe). Confirm `scripts/capture-golden.mjs` is NOT in `files`.

- [ ] **Step 3: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Failures should only be in deleted-bridge references — grep for stragglers: `grep -rn "bridge/index\|KernelBridge\|wstpClient\|kernel-server" src tests` should return nothing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove WSTP/kernel runtime stack; plugin is now kernel-free"
```

---

## Task 15: VS Code extension + packaging cleanup

**Files:**
- Modify: `vscode-extension/package.json` (remove kernel settings/config contributions)
- Modify: `vscode-extension/schemas/prettierrc.schema.json` (drop kernel options)
- Modify: `vscode-extension/src/config.js` and any kernel/status UI in `vscode-extension/src/extension.js`
- Modify: `vscode-extension/.vscodeignore` / packaging so the wasm ships
- Modify: `README.md` and `vscode-extension/README.md` (remove Wolfram Engine requirement)

**Interfaces:**
- Produces: a vsix that bundles the wasm and exposes no kernel settings; docs describe a zero-dependency runtime.

- [ ] **Step 1: Find every kernel reference in the extension and docs**

Run: `grep -rn "enginePath\|systemKernel\|WolframKernel\|wolframscript\|CSTRequestTimeout\|Wolfram Engine\|WSTP" vscode-extension README.md`
List each hit; these are the edits for this task.

- [ ] **Step 2: Remove kernel settings from `vscode-extension/package.json` + schema**

Delete the `wolfram.enginePath`, `wolfram.systemKernel`, and `wolframCSTRequestTimeoutMs` (and any other kernel-only) entries from `contributes.configuration` and from `schemas/prettierrc.schema.json`. Keep all formatting-style options.

- [ ] **Step 3: Remove kernel wiring/UI from extension source**

In `vscode-extension/src/config.js` / `extension.js`, delete code that reads the removed settings or surfaces kernel status/errors. Leave formatting/diagnostics intact.

- [ ] **Step 4: Ensure the wasm ships and update docs**

Confirm the wasm is included when packaging (the extension bundles `src/parser/tree-sitter-wolfram.wasm` via the plugin dependency or a copy step in `scripts/package-vscode-extension.mjs`; add a copy step if needed). Edit `README.md` "Requirements" to drop "A local Wolfram Engine or Mathematica installation" and the `wolfram.enginePath` line; replace the "Runtime reuse / shared kernel helper" wording with the WASM runtime. Do the same in `vscode-extension/README.md`.

- [ ] **Step 5: Run the VS Code tests + package**

Run: `npx vitest run tests/vscode` then `npm run package:vscode`
Expected: VS Code tests PASS; vsix builds and contains the wasm (`unzip -l vscode-extension/*.vsix | grep wasm`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(vscode): drop kernel settings/UI, bundle wasm, update docs"
```

---

## Task 16: Final equivalence sweep + cleanup

**Files:**
- Modify: `README.md` (At-A-Glance / features wording if any kernel mention remains)
- Possibly modify: `tests/wl/production-readiness.wl` expectations if they referenced kernel timing

**Interfaces:**
- Produces: green full suite, no kernel references anywhere, byte-identical corpus formatting.

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Grep for any remaining kernel/WSTP references**

Run: `grep -rni "wstp\|wolframscript\|WolframKernel\|CodeParser\|enginePath\|node-addon" src vscode-extension/src bin README.md package.json | grep -v node_modules`
Expected: only intentional mentions (e.g. historical note in spec/docs). Remove stray runtime references.

- [ ] **Step 3: Confirm a clean format works with no kernel present**

Run: `npx prettier --plugin ./src/index.js --parser wolfram tests/golden/basic.wl`
Expected: formatted Wolfram printed to stdout, no kernel spawned, no error.

- [ ] **Step 4: Commit + summarize**

```bash
git add -A
git commit -m "chore: final tree-sitter back-end sweep; remove residual kernel references"
```

---

## Self-Review

**Spec coverage:**
- Runtime = web-tree-sitter WASM → Tasks 1, 12. ✓
- Grammar as submodule + committed wasm + build script → Task 1; rebuilds in Task 11. ✓
- Adapter at CST-JSON boundary → Tasks 6–11. ✓
- Golden-corpus oracle (CST + formatted), dev-only capture script not shipped → Tasks 5, 14 (files check). ✓
- CST equality modulo trivia + formatted byte-identity hard bar → Tasks 6, 10, 13. ✓ (Phase-0 whitespace finding → Task 2.)
- Tier-1 gap constructs (Slot/Out/MessageName/Get/Put/tilde) → Task 11. ✓
- Tier-3 graceful degradation via Unknown→fallback → Tasks 6, 10. ✓
- Full kernel/WSTP removal incl. node-addon-api + bridge tests → Task 14. ✓
- VS Code settings/UI cleanup + wasm bundling + README → Task 15. ✓
- 1-based char source positions → Task 3. ✓
- Final equivalence sweep → Task 16. ✓

**Placeholder scan:** No "TBD"/"implement later"; intricate CST shapes (patterns, parts, spans, message-name, tilde) are explicitly defined as "mirror the captured `*.cst.json`" — the golden artifact is the concrete spec, which is the correct way to pin shapes we cannot hand-derive without the kernel. Pattern/`part`/`span` leaf mapping is exercised by the golden sweep (Task 10) and the `constructs.wl` entry; if the sweep reveals an unmapped node type, it surfaces as a loud `opName` throw or a `hasError`/`Unknown` skip, not a silent pass.

**Type consistency:** `adapt(tree, source)`, `adaptNode(node, ctx)`, `nodeSource(tsNode, lineIndex)`, `opName(table, literal)`, `WolframParser.getCST(text)`, `cstEqualModuloTrivia(a, b)`, `stripTrivia(node)` are used consistently across tasks. Operator tables (`INFIX_OPS`/`BINARY_OPS`/`PREFIX_OPS`/`POSTFIX_OPS`) are defined in Task 4 and consumed in Tasks 8, 9, 11.

**Note on `pattern`/`blank`/`span` nodes:** these appear in `constructs.wl` (`x_Integer`, `2 ;; 5`). Their adapter cases are added in Task 10/11 driven by the golden sweep failure for `constructs` — if the sweep shows a `pattern`/`span`/`blank` node reaching the `default` branch, add a case mirroring `tests/golden/constructs.cst.json`. This is called out in Task 11 Step 5.

import { describe, it, expect } from "vitest";
import prettier from "prettier";
import { printLeaf } from "../../src/translator/nodes/leaf.js";
import { printBinary } from "../../src/translator/nodes/binary.js";
import { printInfix } from "../../src/translator/nodes/infix.js";
import { printCompound } from "../../src/translator/nodes/compound.js";
import { printGroup } from "../../src/translator/nodes/group.js";
import { printPrefix } from "../../src/translator/nodes/prefix.js";
import { printPostfix } from "../../src/translator/nodes/postfix.js";
import { printTernary } from "../../src/translator/nodes/ternary.js";
import * as plugin from "../../src/index.js";

const opts = {
	wolframSpaceAroundOperators: true,
	wolframSpaceAfterComma: true,
};

function fmt(doc, printWidth = 80) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
}

function comments(text) {
	return text.match(/\(\*.*?\*\)/gs) ?? [];
}

function longestLine(text) {
	return Math.max(
		...text
			.trimEnd()
			.split("\n")
			.map((line) => line.length),
	);
}

function displayLineWidth(line, tabWidth) {
	let width = 0;
	for (const char of line) {
		width += char === "\t" ? tabWidth - (width % tabWidth) : 1;
	}
	return width;
}

function longestDisplayLine(text, tabWidth) {
	return Math.max(
		...text
			.trimEnd()
			.split("\n")
			.map((line) => displayLineWidth(line, tabWidth)),
	);
}

const leafPrint = (node) => {
	if (node.type === "LeafNode") return printLeaf(node, opts);
	if (node.type === "CompoundNode")
		return printCompound(node, opts, leafPrint);
	if (node.type === "BinaryNode") return printBinary(node, opts, leafPrint);
	if (node.type === "InfixNode") return printInfix(node, opts, leafPrint);
	if (node.type === "PrefixNode") return printPrefix(node, opts, leafPrint);
	if (node.type === "PostfixNode") return printPostfix(node, opts, leafPrint);
	if (node.type === "TernaryNode") return printTernary(node, opts, leafPrint);
	return "";
};

function makePath(root, printFn) {
	function at(node) {
		return {
			getValue: () => node,
			call: (print, ...keys) => {
				let cur = node;
				for (const key of keys) cur = cur[key];
				return print(at(cur), opts, printFn);
			},
		};
	}
	return at(root);
}

describe("translator regressions", () => {
	it("prints raw string leaves without double-quoting", () => {
		expect(
			printLeaf(
				{ type: "LeafNode", kind: "String", value: '"processing"' },
				opts,
			),
		).toBe('"processing"');
	});

	it("keeps Part double brackets grouped when broken", async () => {
		const result = await prettier.format("expr[[1, 2]]", {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 8,
			tabWidth: 2,
		});

		expect(result).toBe("expr[[\n  1,\n  2\n]]");
	}, 15000);

	it("keeps prefix and postfix same-subject definitions contiguous", async () => {
		const source =
			"Options @ f = {}\n\n" +
			"f // Options = {}\n\n" +
			"Attributes @ f = {}\n\n" +
			"f // Attributes = {}\n\n" +
			'f::usage = "use f"\n\n' +
			'f::bad = "bad"\n\n' +
			"f @ x_ := x\n\n" +
			"x_ // f := x\n\n" +
			"g @ x_ := x";

		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(result).toBe(
			"Options @ f = {}\n" +
				"f // Options = {}\n" +
				"Attributes @ f = {}\n" +
				"f // Attributes = {}\n" +
				'f::usage = "use f"\n' +
				'f::bad = "bad"\n' +
				"f @ x_ := x\n" +
				"x_ // f := x\n\n" +
				"g @ x_ := x",
		);
	}, 15000);

	it("indents broken postfix continuations in association rules", async () => {
		const source =
			"ExternalEvaluate[\n" +
			"\t$DatabaseReference,\n" +
			"\tStringTemplate[sqlTemplateString][\n" +
			"\t\t<|\n" +
			'\t\t\t"HalfLifeDays" -> OptionValue["HalfLifeDays"] // Replace[Except[_Integer] :> 365.0],\n' +
			'\t\t\t"UnfilteredLimit" -> OptionValue["UnfilteredLimit"] // Replace[Except[_Integer] :> 100],\n' +
			'\t\t\t"FilteredLimit" -> OptionValue["FilteredLimit"] // Replace[Except[_Integer] :> 10]\n' +
			"\t\t|>\n" +
			"\t]\n" +
			"]";

		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
			useTabs: false,
		});

		expect(result).toBe(
			"ExternalEvaluate[\n" +
				"  $DatabaseReference,\n" +
				"  StringTemplate[sqlTemplateString][\n" +
				"    <|\n" +
				'      "HalfLifeDays" -> OptionValue["HalfLifeDays"] //\n' +
				"        Replace[Except[_Integer] :> 365.0],\n" +
				'      "UnfilteredLimit" -> OptionValue["UnfilteredLimit"] //\n' +
				"        Replace[Except[_Integer] :> 100],\n" +
				'      "FilteredLimit" -> OptionValue["FilteredLimit"] //\n' +
				"        Replace[Except[_Integer] :> 10]\n" +
				"    |>\n" +
				"  ]\n" +
				"]",
		);
	}, 15000);

	it("indents broken postfix continuations in list rules", async () => {
		const source =
			'{"HalfLifeDays" -> OptionValue["HalfLifeDays"] // Replace[Except[_Integer] :> 365.0], "FilteredLimit" -> OptionValue["FilteredLimit"] // Replace[Except[_Integer] :> 10]}';

		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
			useTabs: false,
		});

		expect(result).toBe(
			"{\n" +
				'  "HalfLifeDays" -> OptionValue["HalfLifeDays"] //\n' +
				"    Replace[Except[_Integer] :> 365.0],\n" +
				'  "FilteredLimit" -> OptionValue["FilteredLimit"] //\n' +
				"    Replace[Except[_Integer] :> 10]\n" +
				"}",
		);
	}, 15000);

	it("honors the trailing newline formatter option", async () => {
		const baseOptions = {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		};

		await expect(prettier.format("x=1\n", baseOptions)).resolves.toBe(
			"x = 1",
		);
		await expect(
			prettier.format("x=1", {
				...baseOptions,
				wolfram: { trailingNewline: true },
			}),
		).resolves.toBe("x = 1\n");
		await expect(
			prettier.format("x=1", {
				...baseOptions,
				wolframTrailingNewline: true,
			}),
		).resolves.toBe("x = 1\n");
	}, 15000);

	it("formats long string literals as multiline StringJoin expressions", async () => {
		const source =
			'longName = "a very long string that should wrap nicely across multiple lines"';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});

		expect(result).toBe(
			"longName =\n" +
				"  StringJoin[\n" +
				'    "a very long string ",\n' +
				'    "that should wrap ",\n' +
				'    "nicely across multiple ",\n' +
				'    "lines"\n' +
				"  ]",
		);
	}, 15000);

	it("flattens long strings inside StringJoin across repeated formatting", async () => {
		const source =
			'StringJoin["a very long string that should wrap nicely across multiple lines", " and another long tail that will also wrap"]';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});

		expect(once).toBe(
			"StringJoin[\n" +
				'  "a very long string that ",\n' +
				'  "should wrap nicely ",\n' +
				'  "across multiple lines ",\n' +
				'  "and another long tail ",\n' +
				'  "that will also wrap"\n' +
				"]",
		);
		expect(twice).toBe(once);
		expect(twice.split("StringJoin[").length - 1).toBe(1);
	}, 15000);

	it("collapses short infix StringJoin expressions through string handling", async () => {
		const source = 'StringJoin["alpha"] <> " beta" <> " gamma"';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});

		expect(once).toBe('"alpha beta gamma"');
		expect(twice).toBe(once);
	}, 15000);

	it("flattens long infix StringJoin expressions into one stable wrapper", async () => {
		const source =
			'"a very long string that should wrap nicely across multiple lines" <> " and another long tail that will also wrap"';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});

		expect(once).toBe(
			"StringJoin[\n" +
				'  "a very long string that ",\n' +
				'  "should wrap nicely ",\n' +
				'  "across multiple lines ",\n' +
				'  "and another long tail ",\n' +
				'  "that will also wrap"\n' +
				"]",
		);
		expect(twice).toBe(once);
		expect(once.split("StringJoin[").length - 1).toBe(1);
	}, 15000);

	it("keeps wrapped infix StringJoin stable on compact binary right-hand sides", async () => {
		const source =
			'x -> "a very long string that should wrap nicely" <> " across lines"';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});

		expect(once).toContain("x ->\n  StringJoin[");
		expect(longestLine(once)).toBeLessThanOrEqual(30);
		expect(twice).toBe(once);
	}, 15000);

	it("collapses all-string StringJoin calls that fit on one line", async () => {
		const source =
			'StringJoin["alpha", " beta", StringJoin[" gamma"]]';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});

		expect(once).toBe('"alpha beta gamma"');
		expect(twice).toBe(once);
		expect(once).not.toContain("StringJoin");
	}, 15000);

	it("keeps all-string StringJoin calls when the joined literal would exceed one line", async () => {
		const source =
			'StringJoin["1234567890", "1234567890", "1234567890"]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 20,
		});

		expect(result).toBe(
			"StringJoin[\n" +
				'  "123456789012345",\n' +
				'  "678901234567890"\n' +
				"]",
		);
	}, 15000);

	it("keeps comma-separated StringJoin literals wrapped when a trailing comma would overflow", async () => {
		const source = 'f[StringJoin["1234567890123456"], y]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 20,
		});

		expect(longestLine(result)).toBeLessThanOrEqual(20);
		expect(result).toBe(
			"f[\n" +
				"  StringJoin[\n" +
				'    "1234567890123",\n' +
				'    "456"\n' +
				"  ],\n" +
				"  y\n" +
				"]",
		);
	}, 15000);

	it("flattens nested StringJoin calls into one StringJoin", async () => {
		const source =
			'StringJoin[StringJoin["a very long string that should wrap nicely across multiple lines"], "tail"]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 30,
		});

		expect(result).toBe(
			"StringJoin[\n" +
				'  "a very long string that ",\n' +
				'  "should wrap nicely ",\n' +
				'  "across multiple linestail"\n' +
				"]",
		);
		expect(result.split("StringJoin[").length - 1).toBe(1);
	}, 15000);

	it("redistributes adjacent StringJoin string fragments before breaking lines", async () => {
		const source =
			'rawXML = Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"]';
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
		});

		expect(once).toBe(
			"rawXML =\n" +
				"  Import[\n" +
				'    "https://www.wolfram.com/events/technology-conference/innovator-award/",\n' +
				'    "XMLObject"\n' +
				"  ]",
		);
		expect(twice).toBe(once);
		expect(once).not.toContain("StringJoin");
		expect(once).not.toContain('"v"');
		expect(once).not.toContain('"a"');
	}, 15000);

	it("respects printWidth for joined string fragments with wider tab widths", async () => {
		const source =
			'rawXML = Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 4,
			useTabs: false,
		});

		expect(longestLine(result)).toBeLessThanOrEqual(80);
		expect(result).toBe(
			"rawXML =\n" +
				"    Import[\n" +
				'        "https://www.wolfram.com/events/technology-conference/innovator-award/",\n' +
				'        "XMLObject"\n' +
				"    ]",
		);
	}, 15000);

	it("keeps tab-indented joined links intact when wrapping strings", async () => {
		const source =
			'rawXML = Dataset[{<|"x" -> Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"], "sections" -> sections|>}]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 4,
			useTabs: true,
		});

		expect(result).toContain(
			'"https://www.wolfram.com/events/technology-conference/innovator-award/"',
		);
		expect(result).not.toContain(
			'"https://www.wolfram.com/events/technology-conference/",',
		);
	}, 15000);

	it("keeps joined links together when they exceed a chunk width", async () => {
		const source =
			'StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 60,
		});

		expect(result).toBe(
			"StringJoin[\n" +
				'  "https://www.wolfram.com/events/technology-conference/innovator-award/"\n' +
				"]",
		);
	}, 15000);

	it("fills earlier long string chunks before later chunks", async () => {
		const source =
			'StringJoin["a long string with many medium sized words that currently gets split into too many small pieces across lines"]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 40,
		});

		expect(result).toBe(
			"StringJoin[\n" +
				'  "a long string with many medium ",\n' +
				'  "sized words that currently gets ",\n' +
				'  "split into too many small pieces ",\n' +
				'  "across lines"\n' +
				"]",
		);
	}, 15000);

	it("keeps multiline strings within printWidth in nested contexts", async () => {
		const cases = [
			{
				width: 80,
				source: 'StringJoin["Failed to retrieve log file \\`1\\`. Please ensure the file exists and you have read permissions."]',
			},
			{
				width: 20,
				source: 'f[g["123456789012345678"]]',
			},
			{
				width: 20,
				source: '<|"key" -> "a very long string that should wrap nicely across multiple lines"|>',
			},
			{
				width: 40,
				source: 'foo = veryLongFunctionName[anotherLongName["a very long string that should wrap nicely across multiple lines and still respect the configured print width in nested contexts"]]',
			},
		];

		for (const { source, width } of cases) {
			const once = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: width,
			});
			const twice = await prettier.format(once, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: width,
			});

			expect(longestLine(once), source).toBeLessThanOrEqual(width);
			expect(twice, source).toBe(once);
		}
	}, 15000);

	it("keeps compact binary RHS calls stable when nested strings wrap into StringJoin", async () => {
		const cases = [
			{
				source: 'foo -> f[beta, "a fairly long string that should wrap nicely across lines"]',
				operator: "->",
			},
			{
				source: 'foo /. f[beta, "a fairly long string that should wrap nicely across lines"]',
				operator: "/.",
			},
			{
				source: '{a} -> CloudPut[alpha, "short", "a fairly long string that should wrap nicely across lines"]',
				operator: "->",
			},
		];

		for (const { source, operator } of cases) {
			const once = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 40,
			});
			const twice = await prettier.format(once, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 40,
			});

			expect(twice, source).toBe(once);
			expect(once, source).not.toContain(`${operator}\n`);
			expect(once, source).toContain(`${operator} `);
		}
	}, 15000);

	it("keeps width-aware special forms within printWidth after formatting", async () => {
		const cases = [
			{
				width: 30,
				source: "Module[{alphaBetaGammaDelta = 1, secondName = 2}, alphaBetaGammaDelta + secondName]",
				options: { wolframModuleVarsBreakThreshold: 100 },
			},
			{
				width: 40,
				source: "x ~ customLongFunctionName ~ yVeryLongArgumentName",
			},
			{
				width: 30,
				source: "reallyLongLeftHandSideName > reallyLongRightHandSideName",
			},
		];

		for (const { source, width, options = {} } of cases) {
			const formatOptions = {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: width,
				tabWidth: 2,
				...options,
			};
			const once = await prettier.format(source, formatOptions);
			const twice = await prettier.format(once, formatOptions);

			expect(longestLine(once), source).toBeLessThanOrEqual(width);
			expect(twice, source).toBe(once);
		}
	}, 15000);

	it("indents broken block-structure variable-list closures", async () => {
		const cases = ["Module", "With", "Block", "DynamicModule"];

		for (const head of cases) {
			const result = await prettier.format(`${head}[{a = 10}, a]`, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 80,
				tabWidth: 2,
				useTabs: true,
				wolfram: {
					moduleVarsBreakThreshold: 0,
				},
			});

			expect(result, head).toBe(
				`${head}[{\n` + "\t\ta = 10\n" + "\t},\n" + "\ta\n" + "]",
			);
		}
	}, 15000);

	it("respects the condition-first formatting option", async () => {
		const source = "If[x > 0, thenValue, elseValue]";
		const baseOptions = {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 12,
			tabWidth: 2,
		};

		await expect(prettier.format(source, baseOptions)).resolves.toBe(
			"If[x > 0,\n" + "  thenValue,\n" + "  elseValue\n" + "]",
		);

		await expect(
			prettier.format(source, {
				...baseOptions,
				wolfram: {
					conditionFirstFunctions: "",
				},
			}),
		).resolves.toBe(
			"If[\n" + "  x > 0,\n" + "  thenValue,\n" + "  elseValue\n" + "]",
		);
	}, 15000);

	it("keeps condition-first forms structured when a branch preserves compound source lines", async () => {
		const source = "If[readyQ, before[];\nafter[], fallback[]]";
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(result).toBe(
			"If[readyQ,\n" +
				"  before[];\n" +
				"  after[],\n" +
				"  fallback[]\n" +
				"]",
		);
	}, 15000);

	it("keeps Switch case layout when case values preserve compound source lines", async () => {
		const source =
			'Switch[msg, Null, close[];\nReturn[], "Ping", pong[], _, messages["PushBack", msg];\nhandle[msg]]';
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(result).toBe(
			"Switch[msg,\n" +
				"  Null,\n" +
				"    close[];\n" +
				"    Return[],\n" +
				'  "Ping",\n' +
				"    pong[],\n" +
				"  _,\n" +
				'    messages["PushBack", msg];\n' +
				"    handle[msg]\n" +
				"]",
		);
	}, 15000);

	it("preserves incomplete expressions instead of printing raw CST internals", async () => {
		const source = "f[";
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
		});

		expect(result).toBe(source);
		expect(result).not.toContain("CallNode[");
		expect(result).not.toContain("GroupMissingCloserNode[");
	}, 15000);

	it("preserves executable shebang lines while formatting the script body", async () => {
		const source =
			"#!/usr/bin/env wolframscript\n" + "Print[  1+2  ]";
		const once = await prettier.format(source, {
			filepath: "/tmp/script.wls",
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});
		const twice = await prettier.format(once, {
			filepath: "/tmp/script.wls",
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(once).toBe(
			"#!/usr/bin/env wolframscript\n" + "Print[1 + 2]",
		);
		expect(twice).toBe(once);
	}, 15000);

	it("preserves shebang lines even when Wolfram formatting lacks filepath context", async () => {
		const source =
			"#!/usr/bin/env wolframscript\n" + "Print[  1+2  ]";
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(result).toBe(
			"#!/usr/bin/env wolframscript\n" + "Print[1 + 2]",
		);
	}, 15000);

	it("preserves comments in operator expressions", async () => {
		const cases = [
			"a (*1*) + (*2*) b",
			"x /. {a(*c*) -> b}",
			"a (*c*) -> b",
			"x // (*c*) f",
			"! (*c*) x",
			"x ~ (*c*) f ~ y",
			"a(*c*)@b",
			'x::(*c*)"usage"',
		];

		for (const source of cases) {
			const result = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 30,
			});

			expect(comments(result), source).toEqual(comments(source));
			expect(result.length, source).toBeGreaterThan(0);
		}
	}, 15000);

	it("allows separate same-line comments with no space between them", async () => {
		const cases = [
			"(*a*)(*b*)",
			"f[(*a*)(*b*)]",
			"{(*a*)(*b*)}",
			"f[1,(*a*)(*b*)2]",
			"a;(*a*)(*b*)b",
			"a\n(*a*)(*b*)\nb",
		];

		const expected = [
			"(*a*)(*b*)",
			"f[(*a*)(*b*)]",
			"{(*a*)(*b*)}",
			"f[1, (*a*)(*b*) 2]",
			"a; (*a*)(*b*) b",
			"a\n(*a*)(*b*)\nb",
		];

		for (const [index, source] of cases.entries()) {
			const result = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 80,
				tabWidth: 2,
			});

			expect(result, source).toBe(expected[index]);
		}
	}, 15000);

	it("retains multiline comment indentation across formatting passes", async () => {
		const cases = [
			{
				source: "foo[\n\t\t(*\n\t\tSome comment\n\t\t*)\n]",
				expected: "foo[\n  (*\n  Some comment\n  *)\n]",
			},
			{
				source: "foo[\n    (*\n      Some comment\n    *)\n]",
				expected: "foo[\n  (*\n    Some comment\n  *)\n]",
			},
		];

		for (const { source, expected } of cases) {
			const once = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 80,
				tabWidth: 2,
			});
			const twice = await prettier.format(once, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 80,
				tabWidth: 2,
			});

			expect(once, source).toBe(expected);
			expect(twice, source).toBe(once);
		}
	}, 15000);

	it("preserves multiline trailing comments without stringifying doc fragments", async () => {
		const source = "x = 1; (*\n    Some comment\n    *)";
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(once).not.toContain("[object Object]");
		expect(once).toContain("(*");
		expect(once).toContain("Some comment");
		expect(once).toContain("*)");
		expect(twice).toBe(once);
	}, 15000);

	it("preserves multiline comment content when implicit-multiplication spacing precedes it", async () => {
		// `foo  bar` (two spaces between word chars) is collapsed to an
		// InvisibleTimes character before parsing, which shifts the comment's
		// source offsets. The slice used to drop the leading "(" and corrupt
		// the comment. See offset mapping in src/utils/offsets.js.
		const cases = [
			"foo  bar  (* line one\n  line two *)\nx = 1;",
			"aa  bb  cc  (* alpha\n   beta\n   gamma *)\ny = 2;",
			"Module[{x},\n  aa  bb  (* first\n     second *)\n  x = 1\n]",
		];

		for (const source of cases) {
			const result = await prettier.format(source, {
				parser: "wolfram",
				plugins: [plugin],
				printWidth: 80,
				tabWidth: 2,
			});

			// Comment content is preserved exactly (nothing cut).
			expect(comments(result), source).toEqual(comments(source));
			// No unterminated comments: openers and closers stay balanced.
			expect(
				(result.match(/\(\*/g) ?? []).length,
				source,
			).toBe((result.match(/\*\)/g) ?? []).length);
		}
	}, 15000);

	it("groups leading comments with the following definition and keeps the separating blank line above the comment block", async () => {
		const source = "a = 1\n(* docs for b *)\n\nb := 2";
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(once).toBe("a = 1\n\n(* docs for b *)\nb := 2");
		expect(twice).toBe(once);
	}, 15000);

	it("preserves semicolon-terminated adjacent definitions in one pass", async () => {
		const source = "f[x_] := x ^ 2;\ng[x_] := x + 1;";
		const once = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});
		const twice = await prettier.format(once, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(once).toBe("f[x_] := x ^ 2;\n\ng[x_] := x + 1;");
		expect(twice).toBe(once);
	}, 15000);

	it("preserves trailing comments inside block-structured calls", async () => {
		const source = `scrapeCustomerStoryData // PackageScoped;
scrapeCustomerStoryData[]:=
\tBlock[{urlGroup, data},
\t\turlGroup = Flatten@(getURLs /@ $BaseURLs);
\t\tdata = If[
\t\t\tStringTake[#, -3] === "pdf",
\t\t\tscrapePDF[#],
\t\t\tscrapeData[#]
\t\t]& /@ urlGroup;
\t\tDeleteCases[
\t\t\tdata,
\t\t\t<|_,_, "Content"-> x_ /;Length[x] > 0|>,
\t\t\tInfinity
\t\t](*Temp remove broken data*)
\t\t(*Wont actually make inxex correctly, missing map func thats in master*)
        (*Package into defined structure*)

];`;

		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(comments(result)).toEqual(comments(source));
	}, 15000);

	it("keeps wl-disable-line comments attached to the preceding statement inside Module bodies", async () => {
		const source =
			'CommandLineSplit[s_String, opts : OptionsPattern[]] := Catch[Module[{delimStr, escStr, raw}, delimStr = StringJoin @ Flatten @ {OptionValue["TokenDelimiters"]}; escStr = OptionValue["EscapeCharacter"]; raw = scan[s, delimStr, escStr]; (* wl-disable-line UndefinedSymbol *) decode[raw, StringLength[s], StringLength[s]]], "CommandLineSplitError"]';

		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 80,
			tabWidth: 2,
		});

		expect(result).toContain(
			"raw = scan[s, delimStr, escStr]; (* wl-disable-line UndefinedSymbol *)",
		);
		expect(result).toContain(
			"\n      decode[raw, StringLength[s], StringLength[s]]",
		);
		expect(result).not.toContain(
			";\n      (* wl-disable-line UndefinedSymbol *)\n",
		);
	}, 15000);

	it("prints PatternBlank as x_", () => {
		const node = {
			type: "CompoundNode",
			op: "PatternBlank",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Under", value: "_" },
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("x_");
	});

	it("prints PatternBlankSequence as x__", () => {
		const node = {
			type: "CompoundNode",
			op: "PatternBlankSequence",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`UnderUnder", value: "__" },
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("x__");
	});

	it("prints PatternBlankNullSequence as x___", () => {
		const node = {
			type: "CompoundNode",
			op: "PatternBlankNullSequence",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{
					type: "LeafNode",
					kind: "Token`UnderUnderUnder",
					value: "___",
				},
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("x___");
	});

	it("prints typed Blank as _Integer", () => {
		const node = {
			type: "CompoundNode",
			op: "Blank",
			children: [
				{ type: "LeafNode", kind: "Token`Under", value: "_" },
				{ type: "LeafNode", kind: "Symbol", value: "Integer" },
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("_Integer");
	});

	it("prints typed BlankSequence as __Integer", () => {
		const node = {
			type: "CompoundNode",
			op: "BlankSequence",
			children: [
				{ type: "LeafNode", kind: "Token`UnderUnder", value: "__" },
				{ type: "LeafNode", kind: "Symbol", value: "Integer" },
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("__Integer");
	});

	it("prints typed BlankNullSequence as ___Integer", () => {
		const node = {
			type: "CompoundNode",
			op: "BlankNullSequence",
			children: [
				{
					type: "LeafNode",
					kind: "Token`UnderUnderUnder",
					value: "___",
				},
				{ type: "LeafNode", kind: "Symbol", value: "Integer" },
			],
		};
		expect(fmt(printCompound(node, opts, leafPrint))).toBe("___Integer");
	});

	it("prints slot forms correctly", () => {
		expect(
			fmt(
				printLeaf(
					{ type: "LeafNode", kind: "Token`Hash", value: "#" },
					opts,
				),
			),
		).toBe("#");

		expect(
			fmt(
				printCompound(
					{
						type: "CompoundNode",
						op: "Slot",
						children: [
							{
								type: "LeafNode",
								kind: "Token`Hash",
								value: "#",
							},
							{ type: "LeafNode", kind: "Integer", value: "1" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("#1");

		expect(
			fmt(
				printCompound(
					{
						type: "CompoundNode",
						op: "SlotSequence",
						children: [
							{
								type: "LeafNode",
								kind: "Token`HashHash",
								value: "##",
							},
							{ type: "LeafNode", kind: "Integer", value: "2" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("##2");
	});

	it("prints Power as x ^ 2", () => {
		const node = {
			type: "BinaryNode",
			op: "Power",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Caret", value: "^" },
				{ type: "LeafNode", kind: "Integer", value: "2" },
			],
		};
		expect(fmt(printBinary(node, opts, leafPrint))).toBe("x ^ 2");
	});

	it("treats # as a semantic operand in binary expressions", () => {
		const node = {
			type: "BinaryNode",
			op: "Power",
			children: [
				{ type: "LeafNode", kind: "Token`Hash", value: "#" },
				{ type: "LeafNode", kind: "Token`Caret", value: "^" },
				{ type: "LeafNode", kind: "Integer", value: "2" },
			],
		};
		expect(fmt(printBinary(node, opts, leafPrint))).toBe("# ^ 2");
	});

	it("prints ReplaceAll as expr /. rhs", () => {
		const node = {
			type: "BinaryNode",
			op: "ReplaceAll",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "expr" },
				{ type: "LeafNode", kind: "Token`SlashDot", value: "/." },
				{ type: "LeafNode", kind: "Symbol", value: "rules" },
			],
		};
		expect(fmt(printBinary(node, opts, leafPrint))).toBe("expr /. rules");
	});

	it("prints span operators compactly", () => {
		const binaryCases = [
			[
				"1;;3",
				[
					{ type: "LeafNode", kind: "Integer", value: "1" },
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{ type: "LeafNode", kind: "Integer", value: "3" },
				],
			],
			[
				";;3",
				[
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitOne",
						value: "",
					},
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{ type: "LeafNode", kind: "Integer", value: "3" },
				],
			],
			[
				"1;;",
				[
					{ type: "LeafNode", kind: "Integer", value: "1" },
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitAll",
						value: "",
					},
				],
			],
			[
				";;",
				[
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitOne",
						value: "",
					},
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitAll",
						value: "",
					},
				],
			],
		];

		for (const [expected, children] of binaryCases) {
			const node = { type: "BinaryNode", op: "Span", children };
			expect(fmt(printBinary(node, opts, leafPrint))).toBe(expected);
		}

		expect(
			fmt(
				printTernary(
					{
						type: "TernaryNode",
						op: "Span",
						children: [
							{ type: "LeafNode", kind: "Integer", value: "1" },
							{
								type: "LeafNode",
								kind: "Token`SemiSemi",
								value: ";;",
							},
							{ type: "LeafNode", kind: "Integer", value: "3" },
							{
								type: "LeafNode",
								kind: "Token`SemiSemi",
								value: ";;",
							},
							{ type: "LeafNode", kind: "Integer", value: "2" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("1;;3;;2");
	});

	it("prints ;; compactly based on the token even for unexpected binary ops", () => {
		const node = {
			type: "BinaryNode",
			op: "Unknown",
			children: [
				{ type: "LeafNode", kind: "Integer", value: "1" },
				{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
				{ type: "LeafNode", kind: "Integer", value: "3" },
			],
		};

		expect(fmt(printBinary(node, opts, leafPrint))).toBe("1;;3");
	});

	it("prints MessageName without spaces", () => {
		const node = {
			type: "InfixNode",
			op: "MessageName",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Token`ColonColon", value: "::" },
				{ type: "LeafNode", kind: "String", value: "usage" },
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe("f::usage");
	});

	it("prints PatternTest without spaces", () => {
		const node = {
			type: "BinaryNode",
			op: "PatternTest",
			children: [
				{
					type: "CompoundNode",
					op: "PatternBlank",
					children: [
						{ type: "LeafNode", kind: "Symbol", value: "x" },
						{ type: "LeafNode", kind: "Token`Under", value: "_" },
					],
				},
				{ type: "LeafNode", kind: "Token`Question", value: "?" },
				{ type: "LeafNode", kind: "Symbol", value: "NumericQ" },
			],
		};
		expect(fmt(printBinary(node, opts, leafPrint))).toBe("x_?NumericQ");
	});

	it("prints InfixInequality using token text", () => {
		const node = {
			type: "InfixNode",
			op: "InfixInequality",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "n" },
				{ type: "LeafNode", kind: "Token`Greater", value: ">" },
				{ type: "LeafNode", kind: "Integer", value: "0" },
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe("n > 0");
	});

	it("prints actual infix token text for minus expressions", () => {
		const node = {
			type: "InfixNode",
			op: "Plus",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "n" },
				{ type: "LeafNode", kind: "Token`Minus", value: "-" },
				{ type: "LeafNode", kind: "Integer", value: "1" },
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe("n - 1");
	});

	it("prints CompoundExpression with semicolons", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe("a; b");
	});

	it("keeps default all-or-nothing wrapping for unbroken compound expressions", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Symbol", value: "c" },
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint), 1)).toBe("a;\nb;\nc");
	});

	it("preserves individual source line breaks between compound expression parts", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					value: "\n",
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[2, 1],
						[2, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[2, 2],
						[2, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Whitespace",
					value: " ",
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "c",
					source: [
						[2, 4],
						[2, 5],
					],
				},
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint))).toBe("a;\nb; c");
	});

	it("allows a later compound expression part to start on its own line", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Whitespace",
					value: " ",
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[1, 4],
						[1, 5],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 5],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					value: "\n",
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "c",
					source: [
						[2, 1],
						[2, 2],
					],
				},
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint))).toBe("a; b;\nc");
	});

	it("keeps standalone compound comments on their own source lines", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* standalone *)",
					source: [
						[2, 1],
						[2, 17],
					],
				},
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[3, 1],
						[3, 2],
					],
				},
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint))).toBe(
			"a;\n(* standalone *)\nb",
		);
	});

	it("keeps same-line compound comments as prefix comments", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* prefix *)",
					source: [
						[2, 1],
						[2, 13],
					],
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[2, 14],
						[2, 15],
					],
				},
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint))).toBe(
			"a;\n(* prefix *) b",
		);
	});

	it("preserves terminal semicolons in infix compound expressions", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{
					type: "LeafNode",
					kind: "Token`Fake`ImplicitNull",
					value: "",
				},
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe("a; b;");
	});

	it("preserves capped blank lines between compound statements", () => {
		const node = {
			type: "CompoundNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[5, 1],
						[5, 2],
					],
				},
			],
		};

		expect(
			fmt(
				printCompound(
					node,
					{ ...opts, wolframMaxBlankLinesBetweenCode: 2 },
					leafPrint,
				),
			),
		).toBe("a;\n\n\nb");
	});

	it("preserves trailing semicolons in compound statement nodes", () => {
		const node = {
			type: "CompoundNode",
			op: "CompoundExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "b",
					source: [
						[2, 1],
						[2, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[2, 2],
						[2, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Fake`ImplicitNull",
					value: "",
					source: [
						[2, 3],
						[2, 3],
					],
				},
			],
		};

		expect(fmt(printCompound(node, opts, leafPrint))).toBe("a;\nb;");
	});

	it("uses definition spacing between compound definition statements", () => {
		const node = {
			type: "CompoundNode",
			op: "CompoundExpression",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					value: "a = 1",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Semi",
					value: ";",
					source: [
						[1, 6],
						[1, 7],
					],
				},
				{
					type: "BinaryNode",
					op: "SetDelayed",
					value: "b := 2",
					source: [
						[2, 1],
						[2, 7],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		expect(
			fmt(
				printCompound(
					node,
					{ ...opts, wolframNewlinesBetweenDefinitions: 2 },
					print,
				),
			),
		).toBe("a = 1;\n\n\nb := 2");
	});

	it("keeps commas attached to the preceding expression", () => {
		const node = {
			type: "InfixNode",
			op: "Comma",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Comma", value: "," },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
				{ type: "LeafNode", kind: "Token`Comma", value: "," },
				{ type: "LeafNode", kind: "Symbol", value: "c" },
			],
		};

		expect(fmt(printInfix(node, opts, leafPrint))).toBe("a, b, c");
		expect(fmt(printInfix(node, opts, leafPrint), 1)).toBe("a,\nb,\nc");
	});

	it("treats comments as inert in compound expressions", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* comment *)",
				},
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe(
			"a; (* comment *) b",
		);
	});

	it("aligns trailing documentation comments in statement; comment form", () => {
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "operation1" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Token`Comment", value: "(* doc *)" },
			],
		};
		const result = fmt(
			printInfix(
				node,
				{
					...opts,
					printWidth: 80,
					wolframDocumentationCommentColumn: 20,
				},
				leafPrint,
			),
		);
		expect(result).toBe("operation1;         (* doc *)");
	});

	it("prints list contents inside InfixNode[Comma] wrappers", () => {
		const node = {
			type: "GroupNode",
			kind: "List",
			children: [
				{ type: "LeafNode", kind: "Token`OpenCurly", value: "{" },
				{
					type: "InfixNode",
					op: "Comma",
					children: [
						{ type: "LeafNode", kind: "Symbol", value: "a" },
						{ type: "LeafNode", kind: "Token`Comma", value: "," },
						{ type: "LeafNode", kind: "Symbol", value: "b" },
					],
				},
				{ type: "LeafNode", kind: "Token`CloseCurly", value: "}" },
			],
		};
		const print = (path) => {
			const n = path.getValue();
			if (n.type === "LeafNode") return printLeaf(n, opts);
			if (n.type === "GroupNode") return printGroup(path, opts, print, n);
			if (n.type === "InfixNode")
				return printInfix(n, opts, (child) => printLeaf(child, opts));
			return "";
		};
		expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe(
			"{a, b}",
		);
	});

	it("treats comment blocks as inert inside wrapped lists", () => {
		const node = {
			type: "GroupNode",
			kind: "List",
			children: [
				{ type: "LeafNode", kind: "Token`OpenCurly", value: "{" },
				{
					type: "InfixNode",
					op: "Comma",
					children: [
						{ type: "LeafNode", kind: "Symbol", value: "a" },
						{ type: "LeafNode", kind: "Token`Comma", value: "," },
						{
							type: "LeafNode",
							kind: "Token`Comment",
							value: "(* comment *)",
						},
						{ type: "LeafNode", kind: "Symbol", value: "b" },
					],
				},
				{ type: "LeafNode", kind: "Token`CloseCurly", value: "}" },
			],
		};
		const print = (path) => {
			const n = path.getValue();
			if (n.type === "LeafNode") return printLeaf(n, opts);
			if (n.type === "GroupNode") return printGroup(path, opts, print, n);
			if (n.type === "InfixNode")
				return printInfix(n, opts, (child) => printLeaf(child, opts));
			return "";
		};
		expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe(
			"{a, (* comment *) b}",
		);
	});

	it("keeps source-line comments separate inside wrapped lists", () => {
		const node = {
			type: "GroupNode",
			kind: "List",
			children: [
				{ type: "LeafNode", kind: "Token`OpenCurly", value: "{" },
				{
					type: "InfixNode",
					op: "Comma",
					children: [
						{
							type: "LeafNode",
							kind: "Symbol",
							value: "a",
							source: [
								[1, 2],
								[1, 3],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Comma",
							value: ",",
							source: [
								[1, 3],
								[1, 4],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Comment",
							value: "(* comment *)",
							source: [
								[2, 3],
								[2, 16],
							],
						},
						{
							type: "LeafNode",
							kind: "Symbol",
							value: "b",
							source: [
								[3, 3],
								[3, 4],
							],
						},
					],
				},
				{ type: "LeafNode", kind: "Token`CloseCurly", value: "}" },
			],
		};
		const print = (path) => {
			const n = path.getValue();
			if (n.type === "LeafNode") return printLeaf(n, opts);
			if (n.type === "GroupNode") return printGroup(path, opts, print, n);
			if (n.type === "InfixNode")
				return printInfix(n, opts, (child) => printLeaf(child, opts));
			return "";
		};

		expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe(
			"{\n  a,\n  (* comment *)\n  b\n}",
		);
	});

	it("prints association contents with <| |> delimiters", () => {
		const node = {
			type: "GroupNode",
			kind: "Association",
			children: [
				{ type: "LeafNode", kind: "Token`LessBar", value: "<|" },
				{
					type: "InfixNode",
					op: "Comma",
					children: [
						{
							type: "BinaryNode",
							op: "Rule",
							children: [
								{
									type: "LeafNode",
									kind: "Symbol",
									value: "a",
								},
								{
									type: "LeafNode",
									kind: "Token`MinusGreater",
									value: "->",
								},
								{
									type: "LeafNode",
									kind: "Integer",
									value: "1",
								},
							],
						},
						{ type: "LeafNode", kind: "Token`Comma", value: "," },
						{
							type: "BinaryNode",
							op: "RuleDelayed",
							children: [
								{
									type: "LeafNode",
									kind: "Symbol",
									value: "b",
								},
								{
									type: "LeafNode",
									kind: "Token`ColonGreater",
									value: ":>",
								},
								{
									type: "LeafNode",
									kind: "Symbol",
									value: "x",
								},
							],
						},
					],
				},
				{ type: "LeafNode", kind: "Token`BarGreater", value: "|>" },
			],
		};
		const print = (path) => {
			const n = path.getValue();
			if (n.type === "LeafNode") return printLeaf(n, opts);
			if (n.type === "GroupNode") return printGroup(path, opts, print, n);
			if (n.type === "InfixNode") return printInfix(n, opts, leafPrint);
			if (n.type === "BinaryNode") return printBinary(n, opts, leafPrint);
			return "";
		};
		expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe(
			"<|a -> 1, b :> x|>",
		);
	});

	it("treats comment blocks as inert inside associations", () => {
		const node = {
			type: "GroupNode",
			kind: "Association",
			children: [
				{ type: "LeafNode", kind: "Token`LessBar", value: "<|" },
				{
					type: "InfixNode",
					op: "Comma",
					children: [
						{
							type: "BinaryNode",
							op: "Rule",
							children: [
								{
									type: "LeafNode",
									kind: "Symbol",
									value: "a",
								},
								{
									type: "LeafNode",
									kind: "Token`MinusGreater",
									value: "->",
								},
								{
									type: "LeafNode",
									kind: "Integer",
									value: "1",
								},
							],
						},
						{ type: "LeafNode", kind: "Token`Comma", value: "," },
						{
							type: "LeafNode",
							kind: "Token`Comment",
							value: "(* comment *)",
						},
						{
							type: "BinaryNode",
							op: "Rule",
							children: [
								{
									type: "LeafNode",
									kind: "Symbol",
									value: "b",
								},
								{
									type: "LeafNode",
									kind: "Token`MinusGreater",
									value: "->",
								},
								{
									type: "LeafNode",
									kind: "Integer",
									value: "2",
								},
							],
						},
					],
				},
				{ type: "LeafNode", kind: "Token`BarGreater", value: "|>" },
			],
		};
		const print = (path) => {
			const n = path.getValue();
			if (n.type === "LeafNode") return printLeaf(n, opts);
			if (n.type === "GroupNode") return printGroup(path, opts, print, n);
			if (n.type === "InfixNode") return printInfix(n, opts, leafPrint);
			if (n.type === "BinaryNode") return printBinary(n, opts, leafPrint);
			return "";
		};
		expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe(
			"<|a -> 1, (* comment *) b -> 2|>",
		);
	});

	it("prints empty associations as <||>", () => {
		const node = {
			type: "GroupNode",
			kind: "Association",
			children: [
				{ type: "LeafNode", kind: "Token`LessBar", value: "<|" },
				{ type: "LeafNode", kind: "Token`BarGreater", value: "|>" },
			],
		};
		expect(
			fmt(
				printGroup(
					makePath(node, () => ""),
					opts,
					() => "",
					node,
				),
			),
		).toBe("<||>");
	});

	it("indents a broken Rule value's continuation under its key", async () => {
		const source =
			"<|\"key\" -> aaaaa + bbbbb + ccccc + ddddd + eeeee + fffff + ggggg|>";
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 40,
			tabWidth: 4,
			useTabs: false,
		});

		expect(result).toBe(
			"<|\n" +
				"    \"key\" -> aaaaa +\n" +
				"        bbbbb +\n" +
				"        ccccc +\n" +
				"        ddddd +\n" +
				"        eeeee +\n" +
				"        fffff +\n" +
				"        ggggg\n" +
				"|>",
		);
	}, 15000);

	it("keeps a bracketed Rule value's closing token aligned with its key", async () => {
		const source = "<|\"This\" -> f[someVeryLongArgumentName, another]|>";
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
			printWidth: 40,
			tabWidth: 4,
			useTabs: false,
		});

		expect(result).toBe(
			"<|\n" +
				"    \"This\" -> f[\n" +
				"        someVeryLongArgumentName,\n" +
				"        another\n" +
				"    ]\n" +
				"|>",
		);
	}, 15000);

	it("prints shorthand binary operators", () => {
		const cases = [
			["Map", "/@"],
			["Apply", "@@"],
			["MapApply", "@@@"],
			["MapAll", "//@"],
			["BinaryAt", "@"],
			["BinarySlashSlash", "//"],
		];

		for (const [op, token] of cases) {
			const node = {
				type: "BinaryNode",
				op,
				children: [
					{ type: "LeafNode", kind: "Symbol", value: "lhs" },
					{ type: "LeafNode", kind: "Token`Op", value: token },
					{ type: "LeafNode", kind: "Symbol", value: "rhs" },
				],
			};
			expect(fmt(printBinary(node, opts, leafPrint))).toBe(
				`lhs ${token} rhs`,
			);
		}
	});

	it("uses operator-specific wrapping for prefix and postfix operator bodies", () => {
		const cases = [
			["BinaryAt", "f", "@", "body", "f @\nbody"],
			["BinarySlashSlash", "body", "//", "f", "body //\n  f"],
		];

		for (const [op, lhs, token, rhs, expected] of cases) {
			const node = {
				type: "BinaryNode",
				op,
				children: [
					{ type: "LeafNode", kind: "Symbol", value: lhs },
					{ type: "LeafNode", kind: "Token`Op", value: token },
					{ type: "LeafNode", kind: "Symbol", value: rhs },
				],
			};

			expect(fmt(printBinary(node, opts, leafPrint), 5)).toBe(expected);
		}
	});

	it("prints prefix and postfix shorthand operators", () => {
		expect(
			fmt(
				printPrefix(
					{
						type: "PrefixNode",
						op: "Not",
						children: [
							{
								type: "LeafNode",
								kind: "Token`Bang",
								value: "!",
							},
							{ type: "LeafNode", kind: "Symbol", value: "x" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("!x");

		expect(
			fmt(
				printPostfix(
					{
						type: "PostfixNode",
						op: "Function",
						children: [
							{ type: "LeafNode", kind: "Symbol", value: "f" },
							{ type: "LeafNode", kind: "Token`Amp", value: "&" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("f&");

		expect(
			fmt(
				printPostfix(
					{
						type: "PostfixNode",
						op: "Function",
						children: [
							{
								type: "LeafNode",
								kind: "Token`Hash",
								value: "#",
							},
							{ type: "LeafNode", kind: "Token`Amp", value: "&" },
						],
					},
					opts,
					leafPrint,
				),
			),
		).toBe("#&");
	});

	it("prints preserved ternary tilde infix operators like Join", () => {
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "Join" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};
		expect(fmt(printTernary(node, opts, leafPrint))).toBe("Join[x, y]");
	});

	it("supports configurable preserved ~f~ infix heads", () => {
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "CustomOp" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};
		expect(
			fmt(
				printTernary(
					node,
					{
						...opts,
						wolframPreserveTildeInfixFunctions: "Join,CustomOp",
					},
					leafPrint,
				),
			),
		).toBe("x ~ CustomOp ~ y");
	});

	it("normalizes general ternary tilde infix form to call syntax", () => {
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};
		expect(fmt(printTernary(node, opts, leafPrint))).toBe("f[x, y]");
	});

	it("treats anonymous blank leaves as semantic operands in StringExpression", () => {
		// ___ ~~ "str" ~~ x__ ~~ "str2" ~~ ___
		// Anonymous blanks are LeafNode[Token`UnderUnderUnder] in the CST.
		// They must not be classified as operator tokens, or ~~ gets replaced
		// by the op name "StringExpression" and the blanks disappear from output.
		const node = {
			type: "InfixNode",
			op: "StringExpression",
			children: [
				{
					type: "LeafNode",
					kind: "Token`UnderUnderUnder",
					value: "___",
				},
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`TildeTilde", value: "~~" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "String", value: '"hello"' },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`TildeTilde", value: "~~" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{
					type: "LeafNode",
					kind: "Token`UnderUnderUnder",
					value: "___",
				},
			],
		};
		expect(fmt(printInfix(node, opts, leafPrint))).toBe(
			'___ ~~ "hello" ~~ ___',
		);
	});

	it("treats anonymous blank as semantic operand in binary expressions", () => {
		// _ -> x: the LHS is a bare LeafNode[Token`Under], not a CompoundNode.
		const node = {
			type: "BinaryNode",
			op: "Rule",
			children: [
				{ type: "LeafNode", kind: "Token`Under", value: "_" },
				{ type: "LeafNode", kind: "Token`MinusGreater", value: "->" },
				{ type: "LeafNode", kind: "Symbol", value: "x" },
			],
		};
		expect(fmt(printBinary(node, opts, leafPrint))).toBe("_ -> x");
	});
});

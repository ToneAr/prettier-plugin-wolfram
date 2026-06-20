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

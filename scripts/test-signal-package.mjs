import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [tarballArgument] = process.argv.slice(2);

if (tarballArgument === undefined) {
	throw new Error("Expected a package tarball path");
}

const tarball = resolve(tarballArgument);
const consumer = mkdtempSync(join(tmpdir(), "signal-consumer-"));

try {
	writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
	execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: consumer, stdio: "inherit" });
	writeFileSync(
		join(consumer, "consumer.mjs"),
		[
			'import { Signal } from "@signal-tools/signal";',
			"const count = new Signal.State(1);",
			"const doubled = new Signal.Computed(() => count.get() * 2);",
			"if (doubled.get() !== 2) throw new Error('Unexpected initial value');",
			"count.set(2);",
			"if (doubled.get() !== 4) throw new Error('Signal update failed');",
		].join("\n"),
	);
	execFileSync(process.execPath, [join(consumer, "consumer.mjs")], { cwd: consumer, stdio: "inherit" });
	writeFileSync(
		join(consumer, "fixture.ts"),
		[
			'import { Signal } from "@signal-tools/signal";',
			"const count = new Signal.State(1);",
			"const doubled = new Signal.Computed(() => count.get() * 2);",
			"doubled.get();",
		].join("\n"),
	);
	execFileSync(
		join(process.cwd(), "node_modules", ".bin", "tsc"),
		[
			"--strict",
			"--noEmit",
			"--module",
			"es2022",
			"--moduleResolution",
			"bundler",
			"--target",
			"es2024",
			"fixture.ts",
		],
		{ cwd: consumer, stdio: "inherit" },
	);
	console.log(`Validated ${basename(tarball)}`);
} finally {
	rmSync(consumer, { recursive: true, force: true });
}

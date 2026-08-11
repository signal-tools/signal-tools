import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [signalArgument, effectArgument] = process.argv.slice(2);

if (signalArgument === undefined) {
	throw new Error("Expected a Signal package specifier");
}

const signalSpecifier = signalArgument.includes("@npm:") ? signalArgument : resolve(signalArgument);
const temporary = mkdtempSync(join(tmpdir(), "signal-tools-effect-consumer-"));
const packed = effectArgument === undefined ? join(temporary, "package") : undefined;
const npmCache = join(temporary, "npm-cache");
const consumer = join(temporary, "consumer");

mkdirSync(consumer);

if (packed !== undefined) mkdirSync(packed);

try {
	const effectTarball =
		effectArgument === undefined
			? join(
					packed,
					execFileSync(
						"npm",
						[
							"pack",
							"--silent",
							"--cache",
							npmCache,
							"--workspace",
							"@signal-tools/effect",
							"--pack-destination",
							packed,
						],
						{ encoding: "utf8" },
					).trim(),
				)
			: resolve(effectArgument);

	writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
	execFileSync(
		"npm",
		[
			"install",
			"--strict-peer-deps",
			"--no-audit",
			"--no-fund",
			"--cache",
			npmCache,
			signalSpecifier,
			effectTarball,
		],
		{
			cwd: consumer,
			stdio: "inherit",
		},
	);

	const signalPaths = execFileSync("npm", ["ls", "@signal-tools/signal", "--all", "--parseable"], {
		cwd: consumer,
		encoding: "utf8",
	})
		.trim()
		.split(/\r?\n/u)
		.filter(Boolean);

	if (signalPaths.length !== 1 || !signalPaths[0].endsWith("node_modules/@signal-tools/signal")) {
		throw new Error(`Expected one shared Signal installation, received ${signalPaths.length}`);
	}

	writeFileSync(
		join(consumer, "consumer.mjs"),
		[
			'import { createEffect, effect } from "@signal-tools/effect";',
			'import { Signal } from "@signal-tools/signal";',
			"const state = new Signal.State(0);",
			"const values = [];",
			"const dispose = effect(() => values.push(state.get()));",
			"state.set(1); state.set(2);",
			"await Promise.resolve();",
			"if (values.join() !== '0,2') throw new Error('Unexpected effect values');",
			"dispose();",
			"const controller = createEffect(() => values.push(state.get()));",
			"controller.dispose(); controller.start();",
			"if (values.join() !== '0,2') throw new Error('Disposed controller ran');",
		].join("\n"),
	);
	execFileSync(process.execPath, [join(consumer, "consumer.mjs")], { cwd: consumer, stdio: "inherit" });

	writeFileSync(
		join(consumer, "fixture.ts"),
		[
			'import { createEffect, type Dispose, type Effect, effect } from "@signal-tools/effect";',
			'import { Signal } from "@signal-tools/signal";',
			"const state = new Signal.State(0);",
			"const dispose: Dispose = effect(() => state.get());",
			"const controller: Effect = createEffect(() => state.get());",
			"controller.start(); controller.dispose(); dispose();",
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

	console.log(
		`Validated ${signalArgument.includes("@npm:") ? signalArgument : basename(signalSpecifier)} with ${basename(effectTarball)}`,
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}

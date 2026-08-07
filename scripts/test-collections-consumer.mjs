import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const [signalArgument, collectionsArgument] = process.argv.slice(2);

if (signalArgument === undefined) {
	throw new Error("Expected a Signal package specifier");
}

const signalSpecifier = signalArgument.includes("@npm:") ? signalArgument : resolve(signalArgument);
const temporary = mkdtempSync(join(tmpdir(), "signal-tools-consumer-"));
const packed = collectionsArgument === undefined ? join(temporary, "package") : undefined;
const npmCache = join(temporary, "npm-cache");
const consumer = join(temporary, "consumer");

mkdirSync(consumer);

if (packed !== undefined) {
	mkdirSync(packed);
}

try {
	const collectionsTarball =
		collectionsArgument === undefined
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
							"@signal-tools/collections",
							"--pack-destination",
							packed,
						],
						{ encoding: "utf8" },
					).trim(),
				)
			: resolve(collectionsArgument);

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
			collectionsTarball,
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
			'import { Signal } from "@signal-tools/signal";',
			'import { SignalArray, SignalMap, SignalObject, SignalSet } from "@signal-tools/collections";',
			"const array = new SignalArray();",
			"const map = new SignalMap();",
			"const set = new SignalSet();",
			"const object = new SignalObject();",
			"const sizes = new Signal.Computed(() => [array.length, map.size, set.size, Object.keys(object).length]);",
			"if (sizes.get().join() !== '0,0,0,0') throw new Error('Unexpected initial values');",
			"array.push(1); map.set('a', 1); set.add(1); object.a = 1;",
			"if (sizes.get().join() !== '1,1,1,1') throw new Error('Shared Signal tracking failed');",
		].join("\n"),
	);
	execFileSync(process.execPath, [join(consumer, "consumer.mjs")], { cwd: consumer, stdio: "inherit" });

	writeFileSync(
		join(consumer, "fixture.ts"),
		[
			'import { Signal } from "@signal-tools/signal";',
			'import { SignalArray, SignalMap, SignalObject, SignalSet } from "@signal-tools/collections";',
			"const array: number[] = new SignalArray([1]);",
			"const map: Map<string, number> = new SignalMap([['a', 1]]);",
			"const set: Set<number> = new SignalSet([1]);",
			"const object: { value: number } = new SignalObject({ value: 1 });",
			"new Signal.Computed(() => array[0] + (map.get('a') ?? 0) + set.size + object.value);",
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
		`Validated ${signalArgument.includes("@npm:") ? signalArgument : basename(signalSpecifier)} with ${basename(collectionsTarball)}`,
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}

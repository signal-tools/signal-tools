import { glob, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { minify } from "terser";

for await (const filePath of glob("dist/*.js", { exclude: ["dist/*.min.js"] })) {
	const basePath = `${filePath.replace(/\.js$/, "")}`;
	const code = await readFile(filePath, "utf8");

	const result = await minify(code, {
		compress: { passes: 3 },
		ecma: 2020,
		mangle: { keep_classnames: true },
		module: true,
		toplevel: true,
		sourceMap: {
			filename: basename(`${basePath}.min.js`),
			url: basename(`${basePath}.min.js.map`),
		},
	});

	await writeFile(`${basePath}.min.js`, result.code);
	await writeFile(`${basePath}.min.js.map`, result.map);

	const bytes = Buffer.byteLength(result.code);
	const gzipped = gzipSync(result.code).length;

	console.log(`${basePath}.min.js: ${bytes} bytes / ${gzipped} bytes gzipped`);
}

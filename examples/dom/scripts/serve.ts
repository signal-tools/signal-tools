import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const effectDist = dirname(fileURLToPath(import.meta.resolve("@signal-tools/effect")));
const signal = fileURLToPath(import.meta.resolve("@signal-tools/signal"));
const transpiler = new Bun.Transpiler({ loader: "ts" });
const response = (
	file: ReturnType<typeof Bun.file>,
	contentType = file.type || "application/javascript;charset=UTF-8",
) =>
	new Response(file.stream(), {
		headers: {
			"content-type": contentType,
			"content-length": file.size.toString(),
			"last-modified": new Date(file.lastModified).toUTCString(),
		},
	});

const server = Bun.serve({
	hostname: "0.0.0.0",
	port: Number(process.env.FUNDOMENTAL_TEST_PORT ?? 3000),
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			const file = Bun.file("src/index.html");

			if (await file.exists()) return response(file, "text/html;charset=UTF-8");
		}

		if (url.pathname === "/signal.js") {
			const file = Bun.file(signal);

			return response(file);
		}

		if (url.pathname.startsWith("/effect/")) {
			const file = Bun.file(effectDist + url.pathname.slice(7));

			if (await file.exists()) return response(file);
		}

		if (/\.(js|ts)$/.test(url.pathname)) {
			const path = `../dom/src${url.pathname.slice(0, -2)}ts`;
			const file = Bun.file(path);

			if (await file.exists()) {
				const code = await transpiler.transform(await file.text());

				return new Response(code, {
					headers: { "content-type": "application/javascript;charset=UTF-8" },
				});
			}
		}

		if (/\/[\w-]+$/.test(url.pathname)) {
			const file = Bun.file("src" + url.pathname + ".html");

			if (await file.exists()) return response(file, "text/html;charset=UTF-8");
		} else {
			const file = Bun.file("src" + url.pathname);

			if (await file.exists()) return response(file);
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Live at ${server.url}`);

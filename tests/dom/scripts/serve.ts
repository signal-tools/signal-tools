import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const effectDist = dirname(fileURLToPath(import.meta.resolve("@signal-tools/effect")));
const signal = fileURLToPath(import.meta.resolve("@signal-tools/signal"));
const fileResponse = (file: ReturnType<typeof Bun.file>) =>
	new Response(file.stream(), {
		headers: {
			"content-type": file.type || "application/javascript;charset=UTF-8",
			"content-length": file.size.toString(),
			"last-modified": new Date(file.lastModified).toUTCString(),
		},
	});

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.FUNDOMENTAL_TEST_PORT ?? 4173),
	async fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === "/__test__")
			return new Response(
				'<script type="importmap">{"imports":{"@signal-tools/effect":"/effect/index.js","@signal-tools/signal":"/signal.js"}}</script>',
				{
					headers: { "content-type": "text/html;charset=UTF-8" },
				},
			);

		if (pathname.startsWith("/effect/")) {
			const file = Bun.file(effectDist + pathname.slice(7));

			if (await file.exists()) return fileResponse(file);
		}

		if (pathname.startsWith("/dist/")) {
			const file = Bun.file(`../../packages/dom${pathname}`);

			if (await file.exists()) return fileResponse(file);
		}

		if (pathname.startsWith("/demo")) {
			const path = pathname.slice(5) || "/index.html";
			const file = Bun.file(`../../examples/dom/dist${path.includes(".") ? path : path + ".html"}`);

			if (await file.exists()) return fileResponse(file);
		}

		if (pathname === "/signal.js") return fileResponse(Bun.file(signal));

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Test server at ${server.url}`);

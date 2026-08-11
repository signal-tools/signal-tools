import * as assert from "node:assert/strict";
import { it } from "node:test";

const entries = {
	"@signal-tools/dom": [
		"adoptedCSS",
		"attrs",
		"css",
		"dispose",
		"elementInternals",
		"group",
		"html",
		"mathml",
		"props",
		"shadowRoot",
		"svg",
		"text",
	],
};

for (const [entry, exports] of Object.entries(entries)) {
	it(`loads the ${entry} entry with its intended exports`, async () => {
		const module = await import(entry);

		for (const name of exports) assert.ok(name in module, `${entry} exports ${name}`);
	});
}

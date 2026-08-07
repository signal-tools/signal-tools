import * as assert from "node:assert/strict";
import { it } from "node:test";

class TestParent {
	children = [];

	appendChild(node) {
		this.children.push(node);
	}
}

globalThis.document = {
	createElement: (name) => ({ name }),
	createElementNS: (namespace, name) => ({ name, namespace }),
};

const { html, mathml, svg } = await import("@signal-tools/dom");

it("creates, configures, appends, and returns each element kind", () => {
	const parent = new TestParent();
	const templates = [
		[html("div", (element) => (element.configured = true)), undefined],
		[mathml("math", (element) => (element.configured = true)), "http://www.w3.org/1998/Math/MathML"],
		[svg("svg", (element) => (element.configured = true)), "http://www.w3.org/2000/svg"],
	];

	for (const [template, namespace] of templates) {
		const element = template(parent);

		assert.equal(element.configured, true);
		assert.equal(element.namespace, namespace);
		assert.equal(parent.children.at(-1), element);
	}
});

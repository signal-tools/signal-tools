import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Signal } from "@signal-tools/signal";

const { attrs, css, dispose, elementInternals, adoptedCSS } = await import("@signal-tools/dom");

const microtask = () => new Promise((resolve) => queueMicrotask(resolve));
const element = () => ({
	attributes: Object.create(null),
	childNodes: [],
	removeAttribute(name) {
		delete this.attributes[name];
	},
	setAttribute(name, value) {
		this.attributes[name] = String(value);
	},
});

describe("fundomental", () => {
	it("supports static bindings", () => {
		const target = element();

		attrs({ title: "ready" })(target);

		assert.equal(target.attributes.title, "ready");
	});

	it("updates and removes reactive attributes", async () => {
		const title = new Signal.State(null);
		const target = element();

		attrs({ title })(target);

		assert.equal(target.attributes.title, undefined);

		title.set("first");
		title.set("second");

		await microtask();

		assert.equal(target.attributes.title, "second");

		title.set(null);

		await microtask();

		assert.equal(target.attributes.title, undefined);
	});

	it("dereferences computed bindings", async () => {
		const title = new Signal.State("first");
		const computedTitle = new Signal.Computed(() => title.get().toUpperCase());
		const target = element();

		attrs({ title: computedTitle })(target);

		assert.equal(target.attributes.title, "FIRST");

		title.set("second");
		await microtask();

		assert.equal(target.attributes.title, "SECOND");
	});

	it("disposes bindings idempotently before a queued flush", async () => {
		const title = new Signal.State("before");
		const target = element();

		attrs({ title })(target);
		title.set("queued");
		dispose(target);
		dispose(target);

		await microtask();

		assert.equal(target.attributes.title, "before");

		title.set("after");
		await microtask();

		assert.equal(target.attributes.title, "before");
	});

	it("registers cleanup before an initial setter can dispose its owner", async () => {
		const title = new Signal.State("before");
		const values = [];
		const target = {
			childNodes: [],
			removeAttribute() {},
			setAttribute(_name, value) {
				values.push(value);
				dispose(this);
			},
		};

		attrs({ title })(target);
		title.set("after");
		await microtask();

		assert.deepEqual(values, ["before"]);
	});

	it("updates shared signals while disposing bindings independently", async () => {
		const title = new Signal.State("title");
		const first = element();
		const second = element();

		attrs({ title })(first);
		attrs({ title })(second);

		title.set("after");
		dispose(first);
		await microtask();

		assert.equal(first.attributes.title, "title");
		assert.equal(second.attributes.title, "after");

		dispose(second);
		title.set("final");
		await microtask();

		assert.equal(second.attributes.title, "after");
	});

	it("continues updating other signals and rearms after a binding throws", () => {
		const queued = [];
		const queueMicrotask = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (callback) => queued.push(callback);
		const first = new Signal.State("first");
		const second = new Signal.State("second");
		const firstTarget = element();
		const secondTarget = element();
		let shouldThrow = false;
		firstTarget.setAttribute = function (name, value) {
			if (shouldThrow) throw new Error("setter failed");

			this.attributes[name] = String(value);
		};

		attrs({ title: first })(firstTarget);
		attrs({ title: second })(secondTarget);

		try {
			shouldThrow = true;
			first.set("failed");
			second.set("updated");

			assert.equal(queued.length, 1);
			assert.throws(() => queued.shift()(), /setter failed/);
			assert.equal(secondTarget.attributes.title, "updated");

			shouldThrow = false;
			first.set("recovered");
			second.set("updated again");

			assert.equal(queued.length, 1);
			queued.shift()();
			assert.equal(firstTarget.attributes.title, "recovered");
			assert.equal(secondTarget.attributes.title, "updated again");
		} finally {
			globalThis.queueMicrotask = queueMicrotask;
			dispose(firstTarget);
			dispose(secondTarget);
		}
	});

	it("isolates bindings that share a signal when one setter throws", () => {
		const queued = [];
		const queueMicrotask = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (callback) => queued.push(callback);
		const title = new Signal.State("before");
		const firstTarget = element();
		const secondTarget = element();
		let shouldThrow = false;
		firstTarget.setAttribute = function (name, value) {
			if (shouldThrow) throw new Error("setter failed");

			this.attributes[name] = String(value);
		};

		try {
			attrs({ title })(firstTarget);
			attrs({ title })(secondTarget);

			shouldThrow = true;
			title.set("after");

			assert.equal(queued.length, 1);
			assert.throws(() => queued.shift()(), /setter failed/);
			assert.equal(secondTarget.attributes.title, "after");
		} finally {
			globalThis.queueMicrotask = queueMicrotask;
			dispose(firstTarget);
			dispose(secondTarget);
		}
	});

	it("releases a subscription when its initial setter throws", () => {
		const title = new Signal.State("title");
		const target = {
			childNodes: [],
			removeAttribute() {},
			setAttribute() {
				throw new Error("initial setter failed");
			},
		};

		assert.throws(() => attrs({ title })(target), /initial setter failed/);
		assert.equal(Signal.subtle.hasSinks(title), false);
	});

	it("updates element internals without mutating the input", async () => {
		const role = new Signal.State("button");
		const values = { role };
		const target = {};
		let attachments = 0;
		const element = {
			attachInternals() {
				attachments++;
				return target;
			},
		};

		assert.equal(elementInternals(values)(element), element);
		assert.equal(attachments, 1);
		assert.equal(target.role, "button");
		assert.equal(values.role, role);

		role.set("link");
		await microtask();
		assert.equal(target.role, "link");
	});

	it("creates and adopts a stylesheet that updates in place", async () => {
		const cssText = new Signal.State(":host { color: red; }");
		const root = { adoptedStyleSheets: [] };
		globalThis.CSSStyleSheet = class {
			replaceSync(value) {
				this.cssText = value;
			}
		};
		const sheet = css`${cssText}`;

		assert.ok(sheet instanceof CSSStyleSheet);
		assert.equal(sheet.cssText, ":host { color: red; }");
		assert.equal(adoptedCSS(sheet)(root), root);
		assert.equal(root.adoptedStyleSheets.length, 1);
		assert.equal(root.adoptedStyleSheets[0], sheet);

		cssText.set(":host { color: blue; }");
		await microtask();
		assert.equal(root.adoptedStyleSheets.length, 1);
		assert.equal(sheet.cssText, ":host { color: blue; }");

		dispose(sheet);
	});

	it("updates CSS template signal interpolations", async () => {
		const color = new Signal.State("red");
		const root = { adoptedStyleSheets: [], childNodes: [] };
		globalThis.CSSStyleSheet = class {
			replaceSync(value) {
				this.cssText = value;
			}
		};

		adoptedCSS(css`:host { color: ${color}; }`)(root);

		assert.equal(root.adoptedStyleSheets[0].cssText, ":host { color: red; }");

		color.set("blue");
		await microtask();

		assert.equal(root.adoptedStyleSheets[0].cssText, ":host { color: blue; }");

		dispose(root);
		color.set("green");
		await microtask();

		assert.equal(root.adoptedStyleSheets[0].cssText, ":host { color: blue; }");
	});
});

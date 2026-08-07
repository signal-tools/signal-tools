import { expect, test } from "@playwright/test";

test("group independently preserves and toggles multiple-node regions", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, group, html }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const first = new Signal.State(true);
		const second = new Signal.State(true);
		const firstNodes = [html("span", attrs({ id: "a1" })), html("span", attrs({ id: "a2" }))];
		const secondNodes = [html("span", attrs({ id: "b1" })), html("span", attrs({ id: "b2" }))];
		const root = html(
			"main",
			html("i", attrs({ id: "before" })),
			group(first, ...firstNodes),
			html("i", attrs({ id: "between" })),
			group(second, ...secondNodes),
			html("i", attrs({ id: "after" })),
		)();

		document.body.append(root);

		const ids = () => [...root.children].map(({ id }) => id);
		const original = [...root.querySelectorAll("span")];
		const snapshots = [ids()];

		first.set(false);

		await new Promise(queueMicrotask);

		snapshots.push(ids());

		second.set(false);

		await new Promise(queueMicrotask);

		snapshots.push(ids());

		first.set(true);

		await new Promise(queueMicrotask);

		snapshots.push(ids());

		second.set(true);

		await new Promise(queueMicrotask);

		snapshots.push(ids());

		return {
			preserved: original.every((node) => root.querySelector(`#${node.id}`) === node),
			snapshots,
		};
	});

	expect(result).toEqual({
		preserved: true,
		snapshots: [
			["before", "a1", "a2", "between", "b1", "b2", "after"],
			["before", "between", "b1", "b2", "after"],
			["before", "between", "after"],
			["before", "a1", "a2", "between", "after"],
			["before", "a1", "a2", "between", "b1", "b2", "after"],
		],
	});
});

test("group preserves a multi-node fragment returned by one template", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, group, html }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const show = new Signal.State(true);
		const root = document.createElement("main");
		const fragment = (parent) => [
			html("span", attrs({ id: "first" }))(parent),
			html("span", attrs({ id: "second" }))(parent),
		];

		group(show, fragment)(root);

		const original = [...root.children];
		const snapshots = [[...root.children].map(({ id }) => id)];

		show.set(false);

		await new Promise(queueMicrotask);

		snapshots.push([...root.children].map(({ id }) => id));

		show.set(true);

		await new Promise(queueMicrotask);

		snapshots.push([...root.children].map(({ id }) => id));

		return {
			preserved: original.every((node) => root.querySelector(`#${node.id}`) === node),
			snapshots,
		};
	});

	expect(result).toEqual({
		preserved: true,
		snapshots: [["first", "second"], [], ["first", "second"]],
	});
});

test("computed bindings and empty conditional regions update safely", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, group, html }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const value = new Signal.State("first");
		const title = new Signal.Computed(() => value.get().toUpperCase());
		const visible = new Signal.State(true);
		const hidden = new Signal.Computed(() => !visible.get());
		const root = html(
			"main",
			attrs({ title }),
			group(hidden, html("span")),
			group(visible),
			group(visible, () => []),
		)();
		const snapshots = [{ children: root.children.length, nodes: root.childNodes.length, title: root.title }];

		value.set("second");
		visible.set(false);

		await new Promise(queueMicrotask);

		snapshots.push({ children: root.children.length, nodes: root.childNodes.length, title: root.title });

		visible.set(true);

		await new Promise(queueMicrotask);

		snapshots.push({ children: root.children.length, nodes: root.childNodes.length, title: root.title });

		return snapshots;
	});

	expect(result).toEqual([
		{ children: 0, nodes: 3, title: "FIRST" },
		{ children: 1, nodes: 3, title: "SECOND" },
		{ children: 0, nodes: 3, title: "SECOND" },
	]);
});

test("reactive DOM, shadow roots, styles, and element internals work in a browser", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, css, html, elementInternals, props, shadowRoot, adoptedCSS, text }, { Signal }] =
			await Promise.all([import("/dist/index.js"), import("@signal-tools/signal")]);

		const title = new Signal.State("before");
		const textValue = new Signal.State("first");
		const color = new Signal.State("red");
		const role = new Signal.State("button");
		const name = `x-browser-${crypto.randomUUID()}`;
		const sheet = css`:host { color: ${color}; }`;

		customElements.define(
			name,
			class extends HTMLElement {
				attachInternals() {
					return (this.savedInternals = super.attachInternals());
				}
			},
		);

		const element = html(
			name,
			attrs({ title }),
			props({ tabIndex: 2 }),
			elementInternals({ role }),
			shadowRoot({ mode: "open" }, adoptedCSS(sheet), html("span", text(textValue))),
		)();

		document.body.append(element);

		const before = {
			css: element.shadowRoot.adoptedStyleSheets[0].cssRules[0].cssText,
			role: element.savedInternals.role,
			tabIndex: element.tabIndex,
			text: element.shadowRoot.textContent,
			title: element.title,
		};

		title.set("after");
		textValue.set("second");
		color.set("blue");
		role.set("link");

		await new Promise(queueMicrotask);

		return {
			after: {
				css: element.shadowRoot.adoptedStyleSheets[0].cssRules[0].cssText,
				role: element.savedInternals.role,
				text: element.shadowRoot.textContent,
				title: element.title,
			},
			before,
			sheetIsCSSStyleSheet: sheet instanceof CSSStyleSheet,
			sheetCount: element.shadowRoot.adoptedStyleSheets.length,
		};
	});

	expect(result).toEqual({
		after: {
			css: ":host { color: blue; }",
			role: "link",
			text: "second",
			title: "after",
		},
		before: {
			css: ":host { color: red; }",
			role: "button",
			tabIndex: 2,
			text: "first",
			title: "before",
		},
		sheetIsCSSStyleSheet: true,
		sheetCount: 1,
	});
});

test("dispose stops bindings owned directly by elements, text, and roots", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, css, dispose, html, elementInternals, props, shadowRoot, adoptedCSS, text }, { Signal }] =
			await Promise.all([import("/dist/index.js"), import("@signal-tools/signal")]);

		const title = new Signal.State("before");
		const tabIndex = new Signal.State(1);
		const role = new Signal.State("button");
		const textValue = new Signal.State("first");
		const cssText = new Signal.State(":host { color: red; }");
		const name = `x-dispose-${crypto.randomUUID()}`;

		customElements.define(
			name,
			class extends HTMLElement {
				attachInternals() {
					return (this.savedInternals = super.attachInternals());
				}
			},
		);

		const element = html(name, attrs({ title }), props({ tabIndex }), elementInternals({ role }))();
		const textNode = text(textValue)();
		const host = html("article", shadowRoot({ mode: "open" }, adoptedCSS(css`${cssText}`)))();
		const root = host.shadowRoot;

		dispose(element);
		dispose(element);
		dispose(textNode);
		dispose(root);

		title.set("after");
		tabIndex.set(2);
		role.set("link");
		textValue.set("second");
		cssText.set(":host { color: blue; }");

		await new Promise(queueMicrotask);

		return {
			css: root.adoptedStyleSheets[0].cssRules[0].cssText,
			role: element.savedInternals.role,
			tabIndex: element.tabIndex,
			text: textNode.data,
			title: element.title,
		};
	});

	expect(result).toEqual({
		css: ":host { color: red; }",
		role: "button",
		tabIndex: 1,
		text: "first",
		title: "before",
	});
});

test("dispose recursively stops descendants and open shadows without affecting siblings", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, dispose, html, shadowRoot, text }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const childTitle = new Signal.State("child-before");
		const shadowText = new Signal.State("shadow-before");
		const siblingTitle = new Signal.State("sibling-before");
		const parent = html(
			"main",
			html("div", attrs({ title: childTitle })),
			html("article", shadowRoot({ mode: "open" }, text(shadowText))),
		)();
		const sibling = html("aside", attrs({ title: siblingTitle }))();
		const child = parent.querySelector("div");
		const host = parent.querySelector("article");

		dispose(parent);
		childTitle.set("child-after");
		shadowText.set("shadow-after");
		siblingTitle.set("sibling-after");

		await new Promise(queueMicrotask);

		return { child: child.title, shadow: host.shadowRoot.textContent, sibling: sibling.title };
	});

	expect(result).toEqual({ child: "child-before", shadow: "shadow-before", sibling: "sibling-after" });
});

test("dispose retires visible, hidden, multi-node, and nested groups", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ attrs, dispose, group, html, text }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const showVisible = new Signal.State(true);
		const visibleText = new Signal.State("first");
		const visibleRoot = html("section")();
		group(
			showVisible,
			html("span", attrs({ id: "first" }), text(visibleText)),
			html("span", attrs({ id: "second" })),
		)(visibleRoot);
		const visibleNodes = [...visibleRoot.children];

		showVisible.set(false);
		await new Promise(queueMicrotask);
		showVisible.set(true);
		visibleText.set("second");
		await new Promise(queueMicrotask);

		const preserved = visibleNodes.every((node) => visibleRoot.querySelector(`#${node.id}`) === node);
		dispose(visibleNodes[0]);
		dispose(visibleNodes[0]);
		showVisible.set(false);
		visibleText.set("third");

		const showHidden = new Signal.State(false);
		const hiddenText = new Signal.State("hidden-before");
		const hiddenRoot = html("section")();
		let hiddenNode;
		const hiddenPlaceholder = group(showHidden, () => (hiddenNode = html("span", text(hiddenText))()))(hiddenRoot);
		dispose(hiddenPlaceholder);
		dispose(hiddenPlaceholder);
		showHidden.set(true);
		hiddenText.set("hidden-after");

		const showOuter = new Signal.State(true);
		const showInner = new Signal.State(true);
		const nestedText = new Signal.State("nested-before");
		const nestedRoot = html("section")();
		let innerPlaceholder;
		const outerPlaceholder = group(
			showOuter,
			html("article", (article) => {
				innerPlaceholder = group(showInner, html("b", text(nestedText)))(article);
			}),
		)(nestedRoot);
		const nestedNode = nestedRoot.querySelector("b");
		dispose(outerPlaceholder);
		showOuter.set(false);
		showInner.set(false);
		nestedText.set("nested-after");

		await new Promise(queueMicrotask);

		return {
			hidden: { cachedText: hiddenNode.textContent, nodes: hiddenRoot.childNodes.length },
			nested: {
				connected: nestedNode.isConnected,
				innerPlaceholder: innerPlaceholder.data,
				text: nestedNode.textContent,
			},
			visible: { children: visibleRoot.children.length, preserved, text: visibleNodes[0].textContent },
		};
	});

	expect(result).toEqual({
		hidden: { cachedText: "hidden-before", nodes: 1 },
		nested: { connected: false, innerPlaceholder: "", text: "nested-before" },
		visible: { children: 2, preserved: true, text: "second" },
	});
});

test("group owns its region before initial insertion can synchronously dispose it", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ dispose, group, html, text }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const show = new Signal.State(true);
		const textValue = new Signal.State("before");
		const name = `x-dispose-on-connect-${crypto.randomUUID()}`;

		customElements.define(
			name,
			class extends HTMLElement {
				connectedCallback() {
					dispose(this);
				}
			},
		);

		const root = html("main")();
		group(show, html(name), html("span", text(textValue)))(root);
		document.body.append(root);

		show.set(false);
		textValue.set("after");
		await new Promise(queueMicrotask);

		return { children: root.children.length, text: root.lastChild.textContent };
	});

	expect(result).toEqual({ children: 2, text: "before" });
});

test("disposing a host reaches reactive content in its closed shadow root", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const [{ css, dispose, html, shadowRoot, adoptedCSS, text }, { Signal }] = await Promise.all([
			import("/dist/index.js"),
			import("@signal-tools/signal"),
		]);

		const textValue = new Signal.State("before");
		const cssText = new Signal.State(":host { color: red; }");
		let closedRoot;
		const host = html(
			"article",
			shadowRoot({ mode: "closed" }, (root) => {
				closedRoot = root;
				adoptedCSS(css`${cssText}`)(root);
				text(textValue)(root);
			}),
		)();

		dispose(host);
		dispose(host);
		textValue.set("after");
		cssText.set(":host { color: blue; }");

		await new Promise(queueMicrotask);

		return {
			closed: host.shadowRoot === null,
			css: closedRoot.adoptedStyleSheets[0].cssRules[0].cssText,
			text: closedRoot.textContent,
		};
	});

	expect(result).toEqual({ closed: true, css: ":host { color: red; }", text: "before" });
});

test("static values create real DOM without reactive overhead", async ({ page }) => {
	await page.goto("/__test__");

	const result = await page.evaluate(async () => {
		const { attrs, css, group, html, shadowRoot, adoptedCSS, text } = await import("/dist/index.js");
		const nodes = [
			html("input", attrs({ disabled: "" }))(document.body),
			html("p", attrs({ "data-value": "item-2" }), text("one"), html("em"))(document.body),
		];
		const host = html(
			"article",
			shadowRoot({ mode: "open" }, adoptedCSS(css`:host { display: block; }`), group(true, html("slot"))),
		)();

		document.body.append(host);

		return {
			disabled: nodes[0].disabled,
			hostDisplay: host.shadowRoot.adoptedStyleSheets[0].cssRules[0].style.display,
			markup: nodes[1].outerHTML,
			shadow: host.shadowRoot.innerHTML,
		};
	});

	expect(result).toEqual({
		disabled: true,
		hostDisplay: "block",
		markup: '<p data-value="item-2">one<em></em></p>',
		shadow: "<slot></slot>",
	});
});

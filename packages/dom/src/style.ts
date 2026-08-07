import { Signal } from "@signal-tools/signal";

import { handler, isSignal, type Watchable } from "./_internal.js";
import { dispose, own } from "./dispose.js";
import type { DOM } from "./types.js";

/** A value accepted in a {@link css} template interpolation. */
export type CSSValue =
	| string
	| number
	| boolean
	| CSSRule
	| CSSRuleList
	| CSSStyleDeclaration
	| CSSStyleSheet
	| CSSStyleValue
	| null
	| undefined;

/** Creates a constructed stylesheet from a static or signal-derived CSS template. */
export const css = (strings: TemplateStringsArray, ...values: Array<Watchable<CSSValue>>): CSSStyleSheet => {
	const sheet = new CSSStyleSheet();
	const serializeTemplate = () =>
		String.raw(strings, ...values.map((value) => serialize(isSignal(value) ? value.get() : value)));

	handler(
		values.some(isSignal) ? new Signal.Computed(serializeTemplate) : serializeTemplate(),
		(value) => sheet.replaceSync(value),
		sheet,
	);

	return sheet;
};

/** Adopts a constructed stylesheet. */
export const adoptedCSS =
	<T extends DOM.Root = DOM.Root>(sheet: CSSStyleSheet): adoptedCSS.Template<T> =>
	(root) => {
		own(root, () => dispose(sheet));

		root.adoptedStyleSheets.push(sheet);

		return root;
	};

export namespace adoptedCSS {
	export type Template<T extends DOM.Root = DOM.Root> = (root: T) => T;
}

const isInstance = <T>(value: unknown, constructor: { prototype: T } | undefined): value is T =>
	constructor !== undefined &&
	value !== null &&
	typeof value === "object" &&
	Object.prototype.isPrototypeOf.call(constructor.prototype, value);

const serialize = (value: CSSValue): string =>
	isInstance(value, globalThis.CSSStyleSheet)
		? serializeRuleList(value.cssRules)
		: isInstance(value, globalThis.CSSRuleList)
			? serializeRuleList(value)
			: isInstance(value, globalThis.CSSRule) || isInstance(value, globalThis.CSSStyleDeclaration)
				? value.cssText
				: String(value ?? "");

const serializeRuleList = (list: CSSRuleList): string => Array.from(list, (rule) => rule.cssText).join("\n");

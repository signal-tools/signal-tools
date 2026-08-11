import { dispose, own } from "./dispose.js";

/** Attaches a shadow root and applies templates to it. */
export const shadowRoot =
	<T extends DOM.HTML.Element = DOM.HTML.Element>(
		init: ShadowRootInit,
		...items: shadowRoot.Item[]
	): shadowRoot.Template<T> =>
	(element) => {
		const root = element.attachShadow(init);

		for (const template of items) template(root);

		if (init.mode === "closed") own(element, () => dispose(root));

		return element;
	};

export namespace shadowRoot {
	export type Template<T extends DOM.HTML.Element = DOM.HTML.Element> = (host: T) => T;
	export type Item = (shadowRoot: ShadowRoot) => any;
}

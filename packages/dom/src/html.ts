import { render } from "./_internal.js";
import type { svg } from "./svg.js";
import type { DOM } from "./types.js";

/** Creates an HTML element with the specified tag name and applies the given items to it. */
export const html =
	<K extends DOM.HTML.Element.Name>(name: K, ...items: html.Item<K>[]): html.Template<DOM.HTML.ElementMap[K]> =>
	(target) =>
		render(document.createElement(name), items as never, target);

export namespace html {
	export type Template<T extends DOM.HTML.Element = DOM.HTML.Element, P extends ParentNode = ParentNode> = (
		parent?: P,
	) => T;

	export type Item<K extends DOM.HTML.Element.Name = DOM.HTML.Element.Name> =
		| Template<DOM.HTML.ElementMap[K]>
		| ((element: DOM.HTML.ElementMap[K]) => any)
		| svg.Template<DOM.SVG.Element, DOM.HTML.ElementMap[K]>;
}

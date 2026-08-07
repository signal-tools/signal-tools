import { render } from "./_internal.js";
import type { html } from "./html.js";

/** Creates an SVG element with the specified tag name and applies the given items to it. */
export const svg =
	<K extends DOM.SVG.Element.Name>(name: K, ...items: svg.Item<K>[]) =>
	(target?: ParentNode) =>
		render(document.createElementNS("http://www.w3.org/2000/svg", name), items as never, target);

export namespace svg {
	export type Template<T extends DOM.SVG.Element = DOM.SVG.Element, P extends ParentNode = ParentNode> = (
		parent?: P,
	) => T;

	export type Item<K extends DOM.SVG.Element.Name = DOM.SVG.Element.Name> =
		| Template<DOM.SVG.ElementMap[K]>
		| ((element: DOM.SVG.ElementMap[K]) => any)
		| html.Template<DOM.HTML.Element, DOM.SVG.ElementMap[K]>;
}

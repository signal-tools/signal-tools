import { render } from "./_internal.js";
import type { html } from "./html.js";
import type { DOM } from "./types.js";

/** Creates an Math element with the specified tag name and applies the given items to it. */
export const mathml =
	<K extends DOM.MathML.Element.Name>(
		name: K,
		...items: mathml.Item<K>[]
	): mathml.Template<DOM.MathML.ElementMap[K]> =>
	(target?: ParentNode) =>
		render(document.createElementNS("http://www.w3.org/1998/Math/MathML", name), items as never, target);

export namespace mathml {
	export type Template<T extends DOM.MathML.Element = DOM.MathML.Element, P extends ParentNode = ParentNode> = (
		parent?: P,
	) => T;

	export type Item<K extends DOM.MathML.Element.Name = DOM.MathML.Element.Name> =
		| Template<DOM.MathML.ElementMap[K]>
		| ((element: DOM.MathML.ElementMap[K]) => any)
		| html.Template<DOM.HTML.Element, DOM.MathML.ElementMap[K]>;
}

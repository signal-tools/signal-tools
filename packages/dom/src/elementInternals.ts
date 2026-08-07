import { assign, type Watchable } from "./_internal.js";
import type { DOM } from "./types.js";

/** Attaches element internals and reactively assigns writable properties. */
export const elementInternals =
	<T extends DOM.HTML.Element = DOM.HTML.Element>(
		values: elementInternals.InternalsSet,
	): elementInternals.Template<T> =>
	(element) => (assign(element, element.attachInternals(), values), element);

export namespace elementInternals {
	export type Template<T extends DOM.HTML.Element = DOM.HTML.Element> = (element: T) => T;
	export type InternalsSet = {
		[K in keyof DOM.HTML.Element.InternalsMap]: Watchable<DOM.HTML.Element.InternalsMap[K]>;
	};
}

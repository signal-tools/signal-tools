import { assign, type Watchable } from "./_internal.js";

/** Assigns properties to an element. */
export const props =
	<T extends DOM.Element = DOM.Element>(userProps: props.PropertySet<T>): props.Template<T> =>
	(element) => (assign(element, element, userProps), element);

export namespace props {
	export type Template<T extends DOM.Element = DOM.Element> = (element: T) => T;
	export type PropertySet<T extends DOM.Element = DOM.Element> = {
		[K in keyof DOM.PropertySet<T>]: Watchable<DOM.PropertySet<T>[K]>;
	};
}

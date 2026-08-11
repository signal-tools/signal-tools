import type * as htmltype from "@michijs/htmltype";

declare global {
	namespace DOM {
		type Element = HTML.Element | MathML.Element | SVG.Element;

		namespace Element {
			type Name = HTML.Element.Name | MathML.Element.Name | SVG.Element.Name;
		}

		type Document = globalThis.Document;

		type Root = ShadowRoot | Document;

		type ShadowRoot = globalThis.ShadowRoot;

		type AttributeSet<T> =
			| Related<T, DOM.HTML.Element, DOM.HTML.ElementMap, DOM.HTML.AttributeMap>
			| Related<T, DOM.MathML.Element, DOM.MathML.ElementMap, DOM.MathML.AttributeMap>
			| Related<T, DOM.SVG.Element, DOM.SVG.ElementMap, DOM.SVG.AttributeMap>;

		type PropertySet<T> =
			| Related<T, DOM.HTML.Element, DOM.HTML.ElementMap, DOM.HTML.PropertyMap>
			| Related<T, DOM.MathML.Element, DOM.MathML.ElementMap, DOM.MathML.PropertyMap>
			| Related<T, DOM.SVG.Element, DOM.SVG.ElementMap, DOM.SVG.PropertyMap>;

		namespace HTML {
			interface ElementMap extends HTMLElementTagNameMap {}
			interface AttributeMap extends htmltype.HTMLElements {}
			interface PropertyMap extends PartialWritablePropertyMap<ElementMap> {}

			type Element = ElementMap[Element.Name];

			namespace Element {
				type Name = keyof ElementMap;

				type InternalsMap = Partial<ARIAMixin>;
			}
		}

		namespace MathML {
			interface ElementMap extends MathMLElementTagNameMap {}
			interface AttributeMap extends htmltype.MathMLElements {}
			interface PropertyMap extends PartialWritablePropertyMap<ElementMap> {}

			type Element = ElementMap[Element.Name];

			namespace Element {
				type Name = keyof ElementMap;
			}
		}

		namespace SVG {
			interface ElementMap extends SVGElementTagNameMap {}
			interface AttributeMap extends htmltype.SVGElements {}
			interface PropertyMap extends PartialWritablePropertyMap<ElementMap> {}

			type Element = ElementMap[Element.Name];

			namespace Element {
				type Name = keyof ElementMap;
			}
		}
	}
}

export { DOM };

// #region Internals

type Related<T, Element, ElementMap, RelatedMap> = T extends Element
	? {
			[K in keyof ElementMap]: ElementMap[K] extends T
				? K extends keyof RelatedMap
					? RelatedMap[K]
					: never
				: never;
		}[keyof ElementMap]
	: never;

type PartialWritable<T> = Partial<Pick<T, WritableKeys<T>>>;

type PartialWritablePropertyMap<T> = { [K in keyof T]: PartialWritable<T[K]> };

type WritableKeys<T> = {
	[K in keyof T]-?: IfEquals<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }, K>;
}[keyof T];

type IfEquals<X, Y, A = X, B = never> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

// #endregion

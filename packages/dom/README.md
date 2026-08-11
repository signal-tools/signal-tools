# Signal DOM

**Signal DOM** is a small templating library for creating real DOM nodes using a plain functional syntax.

- There is one peer dependency: `@signal-tools/signal`.
- There are no virtual DOMs.
- There are no compilation steps.

## Install

```shell
npm install @signal-tools/signal @signal-tools/dom
```

At its core is a simple primitive:

```typescript
import { attrs, svg } from "@signal-tools/dom";

// () => <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>
const $svg = svg("svg", attrs({ viewBox: "0 0 16 16" }), svg("circle", attrs({ cx: 8, cy: 8, r: 6 })))
```

- HTML can be made with `html()`.
- MathML can be made with `mathml()`.
- SVG can be made with `svg()`.
- Text can be made with `text()`.
- Shadow roots can be attached with `shadowRoot()`.
- Element internals can be configured with `elementInternals()`.
- Constructed stylesheets can be created with `css` and adopted with `adoptedCSS()`.

Calling the returned function mounts live DOM directly:

```typescript
$svg(document.body)
```

## Enter Signals

Signal DOM uses `@signal-tools/signal` directly:

```typescript
import { Signal } from "@signal-tools/signal";
import { attrs, dispose, svg } from "@signal-tools/dom";
```

Static values work normally, while `Signal.State` and `Signal.Computed` values update their bindings automatically.

Migrating from the configurable API: remove `use({ Signal })` and replace `use.Signal` with the imported `Signal`.

Removing DOM nodes does not automatically clean up their reactive bindings. When a reactive subtree is permanently retired, call `dispose(root)` before or after detaching it. Disposal stops updates owned by the root, its current descendants, and shadow content without removing DOM; repeated calls are safe.

Attributes, properties, and nested fragments all react to signals.

If an attribute is a signal, the DOM updates automatically when it changes:

```typescript
const viewBox = new Signal.State("0 0 16 16");

const $svg = svg("svg", attrs({ viewBox }), svg("circle", attrs({ cx: 8, cy: 8, r: 6 })))

// ... later that day ...

viewBox.set("0 0 8 8")
```

A `group()` primitive conditionally presents a persistent group of nodes and handles nested DOM updates cleanly.

Normal false/true toggles intentionally preserve each region's nodes and subscriptions. Dispose the placeholder, any visible top-level region node, or an ancestor only when that region is permanently retired.

Reactive scheduling is provided by `@signal-tools/effect`; both packages share the consumer's peer-installed
`@signal-tools/signal` instance.

### Migrating to `@signal-tools/dom`

Replace `@signal-utils/dom` with `@signal-tools/dom`. The `/pure`, `/hms`, and `/types` subpaths were removed;
import runtime functions and the `DOM` type from the main entry. Static values still avoid creating effects.

```typescript
const showCheck = new Signal.State(true);

svg("svg",
	attrs({ viewBox: "0 0 16 16", }),
	// always show this circle
	svg("circle", attrs({ cx: 8, cy: 8, r: 6 })),

	// only show these circles when showCheck is true
	group(showCheck,
		svg("circle", attrs({ cx: 8, cy: 8, r: 4, fill: "blue" })),
		svg("circle", attrs({ cx: 8, cy: 8, r: 2, fill: "lightblue" })),
	),

	// always show this circle
	svg("circle", attrs({ cx: 8, cy: 8, r: 1 }))
)
```

## Shadow DOM, styles, and internals

`css` creates a `CSSStyleSheet`; signal interpolations update that same sheet. `adoptedCSS()` adopts the sheet into a document or shadow root, and `shadowRoot()` attaches a shadow root and applies templates to it.

```typescript
import { adoptedCSS, css, html, shadowRoot } from "@signal-tools/dom";

const display = new Signal.State("block");

const $card = html("article",
	shadowRoot({ mode: "open" },
		adoptedCSS(css`:host { display: ${display} }`),
		html("slot"),
	),
)
```

Stylesheets remain plain platform objects. `dispose(root)` stops reactive sheets adopted with `adoptedCSS()`; call `dispose(sheet)` when a reactive sheet is used independently.

`elementInternals()` calls `attachInternals()` once and assigns writable `ElementInternals` properties. Its values may also be signals.

```typescript
customElements.define("x-control", class extends HTMLElement {});

const role = new Signal.State<string | null>("button");
const control = elementInternals({ role })(document.createElement("x-control"));
```

As with the underlying DOM APIs, a shadow root or element internals can only be attached to a valid host and cannot be attached twice.

The browser suite covers current Playwright releases of Chromium, Firefox, and WebKit. APIs such as `attachInternals()` and constructed stylesheets still require support from the browser where their corresponding helpers are used.

## Custom elements

Signal DOM templates work directly inside standard custom elements; no package-specific base class is required.

```typescript
class GreetingElement extends HTMLElement {
	constructor() {
		super()

		html("p", text("Hello"))(this.attachShadow({ mode: "open" }))
	}
}

customElements.define("greeting-element", GreetingElement)
```

`disconnectedCallback()` can represent a temporary move followed by reconnection. Call `dispose(this)` there only when the component lifecycle guarantees that instance will never reconnect; disposal is terminal for its existing bindings.

## Fully Typed

**Signal DOM** is fully typed for HTML, SVG, and MathML elements, attributes, and properties.

- Typed HTML (`DOM.HTML`)
  - HTML elements can be typed from `DOM.HTML.ElementMap` or `HTMLElementTagNameMap`.
  - HTML attributes are typed from `DOM.HTML.AttributeMap`.
  - HTML properties are typed from `DOM.HTML.PropertyMap`.
- Typed MathML (`DOM.MathML`)
  - MathML elements are typed from `DOM.MathML.ElementMap` or `MathMLElementTagNameMap`.
  - MathML attributes are typed from `DOM.MathML.AttributeMap`.
  - MathML properties are typed from `DOM.MathML.PropertyMap`.
- Typed SVG (`DOM.SVG`)
  - SVG elements are typed from `DOM.SVG.ElementMap` or `SVGElementTagNameMap`.
  - SVG attributes are typed from `DOM.SVG.AttributeMap`.
  - SVG properties are typed from `DOM.SVG.PropertyMap`.

Attributes allow unknown names for ecosystem compatibility, while properties use strictly typed for safety.

```typescript
const badButton = html(
	"button",
	attrs({
		// allowable because it's an attribute
		wildidea: "yes",
	}),
	props({
		// @ts-expect-error because "yes" is not a boolean
		disabled: "yes",
	}),
	text("Uh, this is a very strange button"),
)
```

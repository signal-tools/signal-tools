import {
	adoptedCSS,
	attrs,
	css,
	type DOM,
	dispose,
	elementInternals,
	group,
	html,
	mathml,
	props,
	shadowRoot,
	svg,
	text,
} from "@signal-tools/dom";
import { Signal } from "@signal-tools/signal";

const title = new Signal.State("title");
const computedTitle = new Signal.Computed(() => title.get());
const sheet: CSSStyleSheet = css`:host {}`;
class CustomElement extends HTMLElement {
	constructor() {
		super();

		text("content")(this.attachShadow({ mode: "open" }));
	}
}
const element = html(
	"article",
	attrs({ title: computedTitle }),
	props({ tabIndex: 0 }),
	shadowRoot({ mode: "open" }, adoptedCSS(sheet), html("slot")),
	text(title),
	group(new Signal.Computed(() => true), html("span")),
);
const styledElement = html(
	"article",
	shadowRoot({ mode: "open" }, adoptedCSS(css`:host { color: ${new Signal.State("red")}; }`), html("slot")),
);
const control = elementInternals({ role: new Signal.State("button") });
const htmlTemplate: typeof html = html;
const htmlNode: DOM.HTML.Element = element();
const shadowWithText = shadowRoot({ mode: "open" }, text("content"));
const disposeResult: ReturnType<() => void> = dispose(document.createTextNode("content"));

void [
	CustomElement,
	control,
	disposeResult,
	htmlNode,
	htmlTemplate,
	mathml,
	dispose(sheet),
	svg,
	shadowWithText,
	styledElement,
];

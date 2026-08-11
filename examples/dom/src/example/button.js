import { attrs, group, html, text } from "@signal-tools/dom";
import { Signal } from "@signal-tools/signal";

class ButtonElement extends HTMLElement {
	#href = new Signal.State("#href");
	#withHref = new Signal.Computed(() => Boolean(this.#href.get()));
	#withoutHref = new Signal.Computed(() => !this.#href.get());

	constructor() {
		super();

		html(
			"div",
			group(this.#withHref, this.#templateOfLink),
			group(this.#withoutHref, this.#templateOfButton),
		)(this.attachShadow({ mode: "open" }));
	}

	get href() {
		return this.#href.get();
	}

	set href(value) {
		this.#href.set(value);
	}
	get #templateOfLink() {
		return html("a", attrs({ href: this.#href }), html("slot", text("Button")));
	}

	get #templateOfButton() {
		return html("button", attrs({ type: "button" }), html("slot", text("Button")));
	}
}

customElements.define("button-element", ButtonElement);

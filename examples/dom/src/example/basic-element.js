import { text } from "@signal-tools/dom";
import { Signal } from "@signal-tools/signal";

class BasicElement extends HTMLElement {
	#content = new Signal.State("Edit my content property.");

	constructor() {
		super();

		text(this.#content)(this.attachShadow({ mode: "open" }));
	}

	get content() {
		return this.#content.get();
	}

	set content(value) {
		this.#content.set(value);
	}
}

customElements.define("basic-element", BasicElement);

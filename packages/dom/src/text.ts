import { handler, type Watchable } from "./_internal.js";

/** Creates a text node with the specified content. */
export const text =
	<P extends ParentNode = ParentNode>(content: Watchable<string | number | boolean>): text.Template<P> =>
	(parent?: ParentNode) => {
		const text = new Text("");

		handler(content, (value) => (text.data = String(value ?? "")), text);

		parent?.appendChild(text);

		return text;
	};

export namespace text {
	export type Template<P extends ParentNode = ParentNode> = (parent?: P) => Text;
}

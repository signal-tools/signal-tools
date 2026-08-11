/** @internal */
export type Disposer = () => void;

const ownership = new WeakMap<object, Set<Disposer>>();

/** @internal Registers a cleanup with its DOM owner. */
export const own = (owner: object, cleanup: Disposer): void => {
	const cleanups = ownership.get(owner);

	cleanups ? cleanups.add(cleanup) : ownership.set(owner, new Set([cleanup]));
};

/** @internal Unregisters a cleanup from its DOM owner. */
export const disown = (owner: object, cleanup: Disposer): void => {
	const cleanups = ownership.get(owner);

	cleanups?.delete(cleanup);

	if (!cleanups?.size) ownership.delete(owner);
};

/** Stops reactive updates owned by a node, its current DOM subtree, or a stylesheet. */
export const dispose = (root: Node | CSSStyleSheet): void => {
	if ("childNodes" in root) {
		for (const child of [...root.childNodes]) dispose(child);

		const shadowRoot = (root as Element).shadowRoot;

		if (shadowRoot) dispose(shadowRoot);
	}

	const cleanups = ownership.get(root);

	if (!cleanups) return;

	ownership.delete(root);

	for (const cleanup of [...cleanups]) cleanup();
};

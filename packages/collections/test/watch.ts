import { Signal } from "@signal-tools/signal";

/** Watches a computed value and reports distinct changes on the microtask queue. */
export function watch<Value>(read: () => Value, notify: (value: Value, previousValue: Value) => void): () => void {
	const computed = new Signal.Computed(read);
	let previousValue = computed.get();
	let disposed = false;
	let queued = false;
	const watcher = new Signal.subtle.Watcher((): void => {
		if (queued || disposed) {
			return;
		}

		queued = true;
		queueMicrotask((): void => {
			queued = false;

			if (disposed) {
				return;
			}

			watcher.watch();

			for (const pending of watcher.getPending()) {
				pending.get();
			}

			const value = computed.get();

			if (!Object.is(value, previousValue)) {
				const oldValue = previousValue;
				previousValue = value;
				notify(value, oldValue);
			}
		});
	});

	watcher.watch(computed);

	return (): void => {
		disposed = true;
		watcher.unwatch(computed);
	};
}

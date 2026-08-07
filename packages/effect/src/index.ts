import { Signal } from "@signal-tools/signal";

declare const queueMicrotask: (callback: () => void) => void;

/** Stops an effect. */
export type Dispose = () => void;

/** Controls an effect whose initial run is explicitly started. */
export interface Effect {
	/** Runs the effect synchronously and starts observing its dependencies. */
	start(): void;

	/** Stops future runs. Disposal before start permanently cancels the effect. */
	dispose(): void;
}

const activeEffects = new WeakSet<object>();

const watcher = new Signal.subtle.Watcher(() => {
	queueMicrotask(flush);
});

const flush = (): void => {
	const pending = watcher.getPending();
	const errors: unknown[] = [];

	// Rearm first so cascading invalidations schedule another flush.
	watcher.watch();

	for (const effect of pending) {
		if (!activeEffects.has(effect)) continue;

		try {
			effect.get();
		} catch (error) {
			errors.push(error);
		}
	}

	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, "Multiple effects failed");
};

/** Creates a dormant effect controller. */
export const createEffect = (run: () => void): Effect => {
	const computed = new Signal.Computed(run);
	let state: "dormant" | "active" | "disposed" = "dormant";

	const dispose = (): void => {
		if (state === "disposed") return;

		state = "disposed";

		if (activeEffects.delete(computed)) watcher.unwatch(computed);
	};

	const start = (): void => {
		if (state !== "dormant") return;

		state = "active";
		activeEffects.add(computed);
		watcher.watch(computed);

		try {
			computed.get();
		} catch (error) {
			dispose();
			throw error;
		}
	};

	return { start, dispose };
};

/** Runs an effect immediately and returns its disposer. */
export const effect = (run: () => void): Dispose => {
	const controller = createEffect(run);

	controller.start();

	return controller.dispose;
};

import { Signal } from "@signal-tools/signal";

const versionOptions = { equals: (): boolean => false };

export interface VersionSignal {
	get(): undefined;
	set(value: undefined): undefined;
}

/** Creates a version signal whose writes always notify watchers. */
export const versionSignal = (): VersionSignal => new Signal.State(undefined, versionOptions);

/** Reads the keyed version signal inside a computed, creating it on demand. */
export function consumeKey<Key>(signals: Map<Key, VersionSignal>, key: Key): void {
	if (Signal.subtle.currentComputed() === undefined) {
		return;
	}

	let signal = signals.get(key);

	if (signal === undefined) {
		signal = versionSignal();
		signals.set(key, signal);
	}

	signal.get();
}

/** Parses a canonical array index below the maximum array length. */
export function arrayIndexOf(key: PropertyKey): number | undefined {
	if (typeof key !== "string" || key === "") {
		return undefined;
	}

	const index = Number(key);

	return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === key ? index : undefined;
}

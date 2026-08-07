import { Signal } from "@signal-tools/signal";

import { type VersionSignal, versionSignal } from "./internal.js";

/** Creates a shallow signal-backed proxy around a plain record. */
export function signalProxy(target: object): object {
	return new Proxy(target as PropertyBag, new SignalHandler());
}

class SignalHandler implements ProxyHandler<PropertyBag> {
	readonly #presence = new Map<Key, VersionSignal>();
	readonly #values = new Map<Key, VersionSignal>();
	#structure: VersionSignal | undefined;

	get(target: PropertyBag, key: Key): unknown {
		this.#read(this.#values, key);
		return target[key];
	}

	has(target: PropertyBag, key: Key): boolean {
		this.#read(this.#presence, key);
		return Reflect.has(target, key);
	}

	ownKeys(target: PropertyBag): ArrayLike<Key> {
		if (Signal.subtle.currentComputed() !== undefined) {
			(this.#structure ??= versionSignal()).get();
		}

		return Reflect.ownKeys(target);
	}

	set(target: PropertyBag, key: Key, value: unknown): boolean {
		const had = Object.hasOwn(target, key);

		if (had && Object.is(target[key], value)) {
			return true;
		}

		if (!Reflect.set(target, key, value)) {
			return false;
		}

		this.#dirty(this.#values, key);

		if (!had) {
			this.#dirty(this.#presence, key);
			this.#structure?.set(undefined);
		}

		return true;
	}

	deleteProperty(target: PropertyBag, key: Key): boolean {
		const had = Object.hasOwn(target, key);
		const result = Reflect.deleteProperty(target, key);

		if (result && had) {
			this.#dirty(this.#presence, key);
			this.#dirty(this.#values, key);
			this.#presence.delete(key);
			this.#values.delete(key);
			this.#structure?.set(undefined);
		}

		return result;
	}

	#read(signals: Map<Key, VersionSignal>, key: Key): void {
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

	#dirty(signals: Map<Key, VersionSignal>, key: Key): void {
		signals.get(key)?.set(undefined);
	}
}

type Key = string | symbol;
type PropertyBag = Record<Key, unknown>;

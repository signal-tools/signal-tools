import { Signal } from "@signal-tools/signal";

import { consumeKey, type VersionSignal, versionSignal } from "./internal.js";

/** A Map with signal-backed key and iteration reads. */
export class SignalMap<Key = unknown, Value = unknown> extends Map<Key, Value> {
	readonly #presence = new Map<Key, VersionSignal>();
	readonly #values = new Map<Key, VersionSignal>();
	#structure: VersionSignal | undefined;
	#contents: VersionSignal | undefined;

	constructor(entries?: readonly (readonly [Key, Value])[] | Iterable<readonly [Key, Value]> | null) {
		super();

		if (entries !== undefined && entries !== null) {
			for (const [key, value] of entries) {
				super.set(key, value);
			}
		}
	}

	override get(key: Key): Value | undefined {
		consumeKey(this.#values, key);
		return super.get(key);
	}

	override has(key: Key): boolean {
		consumeKey(this.#presence, key);
		return super.has(key);
	}

	override entries(): MapIterator<[Key, Value]> {
		this.#consumeContents();
		return super.entries();
	}

	override keys(): MapIterator<Key> {
		this.#consumeStructure();
		return super.keys();
	}

	override values(): MapIterator<Value> {
		this.#consumeContents();
		return super.values();
	}

	override forEach(callback: (value: Value, key: Key, map: Map<Key, Value>) => void, thisArg?: unknown): void {
		this.#consumeContents();
		super.forEach(callback, thisArg);
	}

	override get size(): number {
		this.#consumeStructure();
		return super.size;
	}

	override [Symbol.iterator](): MapIterator<[Key, Value]> {
		return this.entries();
	}

	override set(key: Key, value: Value): this {
		const present = super.has(key);

		if (present && Object.is(super.get(key), value)) {
			return this;
		}

		super.set(key, value);
		dirty(this.#values.get(key));
		dirty(this.#contents);

		if (!present) {
			dirty(this.#presence.get(key));
			dirty(this.#structure);
		}

		return this;
	}

	override delete(key: Key): boolean {
		if (!super.delete(key)) {
			return false;
		}

		dirty(this.#presence.get(key));
		dirty(this.#values.get(key));
		this.#presence.delete(key);
		this.#values.delete(key);
		dirty(this.#structure);
		dirty(this.#contents);
		return true;
	}

	override clear(): void {
		if (super.size === 0) {
			return;
		}

		super.clear();
		dirtyAll(this.#presence);
		dirtyAll(this.#values);
		this.#presence.clear();
		this.#values.clear();
		dirty(this.#structure);
		dirty(this.#contents);
	}

	#consumeStructure(): void {
		if (Signal.subtle.currentComputed() !== undefined) {
			(this.#structure ??= versionSignal()).get();
		}
	}

	#consumeContents(): void {
		if (Signal.subtle.currentComputed() !== undefined) {
			(this.#contents ??= versionSignal()).get();
		}
	}
}

function dirty(signal?: VersionSignal): void {
	signal?.set(undefined);
}

function dirtyAll<Key>(signals: Map<Key, VersionSignal>): void {
	for (const signal of signals.values()) {
		signal.set(undefined);
	}
}

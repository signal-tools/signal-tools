import { Signal } from "@signal-tools/signal";

import { consumeKey, type VersionSignal, versionSignal } from "./internal.js";

/** A Set with signal-backed membership and iteration reads. */
export class SignalSet<Value = unknown> extends Set<Value> {
	readonly #members = new Map<Value, VersionSignal>();
	#collection: VersionSignal | undefined;

	constructor(values?: readonly Value[] | Iterable<Value> | null) {
		super();

		if (values !== undefined && values !== null) {
			for (const value of values) {
				super.add(value);
			}
		}
	}

	override has(value: Value): boolean {
		consumeKey(this.#members, value);
		return super.has(value);
	}

	override entries(): SetIterator<[Value, Value]> {
		this.#consume();
		return super.entries();
	}

	override keys(): SetIterator<Value> {
		return this.values();
	}

	override values(): SetIterator<Value> {
		this.#consume();
		return super.values();
	}

	override forEach(callback: (value: Value, key: Value, set: Set<Value>) => void, thisArg?: unknown): void {
		this.#consume();
		super.forEach(callback, thisArg);
	}

	override get size(): number {
		this.#consume();
		return super.size;
	}

	override [Symbol.iterator](): SetIterator<Value> {
		return this.values();
	}

	override add(value: Value): this {
		if (super.has(value)) {
			return this;
		}

		super.add(value);
		this.#members.get(value)?.set(undefined);
		this.#collection?.set(undefined);
		return this;
	}

	override delete(value: Value): boolean {
		if (!super.delete(value)) {
			return false;
		}

		this.#members.get(value)?.set(undefined);
		this.#members.delete(value);
		this.#collection?.set(undefined);
		return true;
	}

	override clear(): void {
		if (super.size === 0) {
			return;
		}

		super.clear();

		for (const signal of this.#members.values()) {
			signal.set(undefined);
		}

		this.#members.clear();
		this.#collection?.set(undefined);
	}

	#consume(): void {
		if (Signal.subtle.currentComputed() !== undefined) {
			(this.#collection ??= versionSignal()).get();
		}
	}
}

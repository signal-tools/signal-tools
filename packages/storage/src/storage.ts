/// <reference lib="esnext.disposable" preserve="true" />

import {
	Storage as ClientStorage,
	type StorageKey,
	type StorageSubscriber,
	type StorageValue,
} from "@serve-tools/client-storage";
import { Signal } from "@signal-tools/signal";

export type {
	StorageChange,
	StorageKey,
	StorageSubscribeOptions,
	StorageSubscriber,
	StorageValue,
} from "@serve-tools/client-storage";

class ReactiveStorageValue<Value extends string> extends Signal.Computed<Value | null> implements Disposable {
	readonly #refreshValue: () => void;

	#unsubscribe: (() => void) | undefined;

	constructor(read: () => Value | null, subscribe: (subscriber: StorageSubscriber<string, Value>) => () => void) {
		const state = new Signal.State(read());

		super(() => state.get());

		this.#refreshValue = () => state.set(read());

		this.#unsubscribe = subscribe((change) =>
			state.set(change.kind === "invalidated" ? read() : change.kind === "removed" ? null : change.value),
		);
	}

	refresh(): void {
		if (this.#unsubscribe) {
			this.#refreshValue();
		}
	}

	dispose(): void {
		const unsubscribe = this.#unsubscribe;

		if (unsubscribe === undefined) {
			return;
		}

		this.#unsubscribe = undefined;

		unsubscribe();
	}

	[Symbol.dispose](): void {
		this.dispose();
	}
}

export class Storage<Schema extends SchemaDefinition<Schema> = Storage.Schema> extends ClientStorage<Schema> {
	/**
	 * Returns a read-only computed signal containing the current value of one key.
	 * Known changes apply their exact delta; invalidation and `refresh()` reread storage synchronously. Signal consumers
	 * may coalesce changes. Disposal is idempotent, freezes the last value, and makes later refreshes no-ops.
	 */
	watch<Key extends StorageKey<Schema>>(key: Key): StorageSignal<StorageValue<Schema, Key>> {
		return new ReactiveStorageValue(
			() => this.get(key),
			(subscriber) => this.subscribe(key, subscriber),
		);
	}
}

export namespace Storage {
	export type Schema = ClientStorage.Schema;
}

/** A read-only computed storage value with synchronous refresh and an explicit observation lifecycle. */
export type StorageSignal<Value extends string = string> = InstanceType<typeof Signal.Computed<Value | null>> &
	Disposable & {
		/** Stops observation once and freezes the last value. */
		dispose(): void;

		/** Rereads storage synchronously while observation is active. */
		refresh(): void;
	};

type SchemaDefinition<Schema> = { [Key in keyof Schema]-?: string };

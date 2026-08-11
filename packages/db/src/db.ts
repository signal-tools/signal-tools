/// <reference lib="esnext.disposable" preserve="true" />

import {
	connect as connectSharedDB,
	type SharedDBClient,
	type SharedDBSubscribeOptions,
	type SharedDBSubscription,
} from "@serve-tools/client-shared-db/scope/window";
import { createEffect } from "@signal-tools/effect";
import { type AnySignal, Signal } from "@signal-tools/signal";

export type {
	SharedDBChange,
	SharedDBClient,
	SharedDBSubscribeOptions,
	SharedDBSubscriber,
	SharedDBSubscription,
} from "@serve-tools/client-shared-db/scope/window";

const pending = { status: "pending" } as const;
const Computed = Signal.Computed;

type Subscribe = (
	invalidate: () => void,
	onReady: NonNullable<SharedDBSubscribeOptions["onReady"]>,
	onError: NonNullable<SharedDBSubscribeOptions["onError"]>,
) => SharedDBSubscription;

class ReactiveQuery<T> extends Computed<QueryState<T>> implements Query<T> {
	readonly #invalidate: () => void;
	readonly #refresh: (options?: OperationOptions) => Promise<void>;
	readonly #stop: () => void;

	constructor(
		read: (ready: Promise<void>, options?: OperationOptions) => Promise<T>,
		subscribe: Subscribe,
		onDispose: () => void,
	) {
		const state = new Signal.State<QueryState<T>>(pending);

		super(() => state.get());

		const invalidation = new Signal.State(0);
		let current = Promise.resolve();
		let disposed = false;
		let generation = 0;
		let readySettled = false;
		let resolveReady!: () => void;
		let rejectReady!: (error: unknown) => void;
		const ready = new Promise<void>((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});
		const settleReady = (error?: unknown) => {
			if (readySettled) return;

			readySettled = true;
			if (error === undefined) resolveReady();
			else rejectReady(error);
		};
		const fail = (error: unknown) => {
			if (disposed) return;

			settleReady(error);
			generation++;
			current = Promise.resolve();
			state.set({ status: "error", error });
		};
		const refresh = (options?: OperationOptions): Promise<void> => {
			if (disposed) return Promise.reject(new DOMException("Query is disposed", "InvalidStateError"));

			const request = ++generation;
			let result: Promise<QueryState<T>>;

			state.set(pending);

			try {
				result = read(ready, options).then<QueryState<T>, QueryState<T>>(
					(value) => ({ status: "ready", value }),
					(error: unknown) => ({ status: "error", error }),
				);
			} catch (error) {
				result = Promise.resolve({ status: "error", error });
			}

			current = result.then((nextState) => {
				if (request !== generation) return current;

				state.set(nextState);
			});

			return current;
		};
		const subscription = subscribe(
			() => invalidation.set(invalidation.get() + 1),
			() => settleReady(),
			fail,
		);
		const controller = createEffect(() => {
			invalidation.get();
			void refresh();
		});

		this.#invalidate = () => invalidation.set(invalidation.get() + 1);
		this.#refresh = refresh;
		this.#stop = () => {
			if (disposed) return;

			disposed = true;
			settleReady(new DOMException("Query is disposed", "InvalidStateError"));
			controller.dispose();
			subscription.unsubscribe();
			onDispose();
		};

		controller.start();
	}

	invalidate(): void {
		this.#invalidate();
	}

	refresh(options?: OperationOptions): Promise<void> {
		return this.#refresh(options);
	}

	dispose(): void {
		this.#stop();
	}

	[Symbol.dispose](): void {
		this.dispose();
	}
}

/** A typed shared database client with signal-backed reactive queries. */
export class DB<Schema extends SchemaDefinition<Schema> = DB.Schema> implements Disposable {
	readonly #queries = new Map<ReactiveQuery<unknown>, StoreName<Schema>>();

	constructor(readonly source: SharedDBClient<Schema>) {
		void source.closed.then(() => this.#disposeQueries());
	}

	get<Name extends StoreName<Schema>>(
		storeName: Name,
		key: StoreKey<Schema[Name]> | IDBKeyRange,
		options?: OperationOptions,
	): Promise<StoreValue<Schema[Name]> | undefined> {
		return this.source.get(storeName, key, options);
	}

	getAll<Name extends StoreName<Schema>>(
		storeName: Name,
		options?: GetAllOptions<Schema[Name]>,
	): Promise<StoreValue<Schema[Name]>[]> {
		return this.source.getAll(storeName, options);
	}

	getAllKeys<Name extends StoreName<Schema>>(
		storeName: Name,
		options?: GetAllOptions<Schema[Name]>,
	): Promise<StoreKey<Schema[Name]>[]> {
		return this.source.getAllKeys(storeName, options);
	}

	has<Name extends StoreName<Schema>>(
		storeName: Name,
		key: StoreKey<Schema[Name]> | IDBKeyRange,
		options?: OperationOptions,
	): Promise<boolean> {
		return this.source.has(storeName, key, options);
	}

	count<Name extends StoreName<Schema>>(storeName: Name, options?: CountOptions<Schema[Name]>): Promise<number> {
		return this.source.count(storeName, options);
	}

	add<Name extends StoreName<Schema>>(
		storeName: Name,
		value: StoreValue<Schema[Name]>,
		options?: WriteOptions<Schema[Name]>,
	): Promise<StoreKey<Schema[Name]>> {
		return this.source.add(storeName, value, options);
	}

	put<Name extends StoreName<Schema>>(
		storeName: Name,
		value: StoreValue<Schema[Name]>,
		options?: WriteOptions<Schema[Name]>,
	): Promise<StoreKey<Schema[Name]>> {
		return this.source.put(storeName, value, options);
	}

	delete<Name extends StoreName<Schema>>(
		storeName: Name,
		key: StoreKey<Schema[Name]> | IDBKeyRange,
		options?: MutationOptions,
	): Promise<void> {
		return this.source.delete(storeName, key, options);
	}

	clear<Name extends StoreName<Schema>>(storeName: Name, options?: MutationOptions): Promise<void> {
		return this.source.clear(storeName, options);
	}

	/** Refreshes every active query for one or more stores. */
	invalidate<const Names extends StoreName<Schema>>(storeNames: Names | readonly Names[]): void {
		const names: readonly StoreName<Schema>[] = typeof storeNames === "string" ? [storeNames] : storeNames;

		for (const [query, storeName] of this.#queries) {
			if (names.includes(storeName)) query.invalidate();
		}
	}

	/** Watches one record and refreshes it after committed changes to its store. */
	watch<Name extends StoreName<Schema>>(
		storeName: Name,
		key: Watchable<StoreKey<Schema[Name]> | IDBKeyRange>,
	): Query<StoreValue<Schema[Name]> | undefined> {
		return this.#query(storeName, (ready, options) => {
			const currentKey = valueOf(key);

			return ready.then(() => this.get(storeName, currentKey, options));
		});
	}

	/** Watches all matching records and refreshes them after committed changes to their store. */
	watchAll<Name extends StoreName<Schema>>(
		storeName: Name,
		options?: WatchAllOptions<Schema[Name]>,
	): Query<StoreValue<Schema[Name]>[]> {
		return this.#query(storeName, (ready, operationOptions) => {
			const count = valueOf(options?.count);
			const query = valueOf(options?.query);
			const getAllOptions = {
				...operationOptions,
				...(count === undefined ? {} : { count }),
				...(query === undefined ? {} : { query }),
			};

			return ready.then(() => this.getAll(storeName, getAllOptions));
		});
	}

	close(reason?: unknown): void {
		this.#disposeQueries();
		this.source.close(reason);
	}

	dispose(): void {
		this.close();
	}

	[Symbol.dispose](): void {
		this.dispose();
	}

	#disposeQueries(): void {
		for (const query of this.#queries.keys()) query.dispose();
	}

	#query<T>(
		storeName: StoreName<Schema>,
		read: (ready: Promise<void>, options?: OperationOptions) => Promise<T>,
	): Query<T> {
		let query: ReactiveQuery<T>;

		query = new ReactiveQuery(
			read,
			(invalidate, onReady, onError) => this.source.subscribe(storeName, invalidate, { onError, onReady }),
			() => this.#queries.delete(query),
		);
		this.#queries.set(query as ReactiveQuery<unknown>, storeName);

		return query;
	}

	static connect<Schema extends SchemaDefinition<Schema> = DB.Schema>(port: MessagePort): DB<Schema> {
		return new this<Schema>(connectSharedDB<Schema>(port));
	}
}

function valueOf<T>(value: Watchable<T>): T;
function valueOf<T>(value: Watchable<T> | undefined): T | undefined;
function valueOf<T>(value: Watchable<T> | undefined): T | undefined {
	return Signal.isState(value) || Signal.isComputed(value) ? (value.get() as T) : value;
}

/** The observable state of a shared database query. */
export type QueryState<T> =
	| { readonly status: "pending" }
	| { readonly status: "ready"; readonly value: T }
	| { readonly status: "error"; readonly error: unknown };

/** A computed query that can be refreshed or disconnected from its dependencies. */
export type Query<T> = InstanceType<typeof Signal.Computed<QueryState<T>>> &
	Disposable & {
		/** Runs the query again and resolves once the latest requested state has been published. */
		refresh(options?: OperationOptions): Promise<void>;

		/** Stops automatic refreshes. An in-flight request may still settle. */
		dispose(): void;
	};

/** A static value or readable signal. */
export type Watchable<T> = T | AnySignal<T>;

export namespace DB {
	export interface Store<
		Value = unknown,
		Key extends IDBValidKey = IDBValidKey,
		Indexes extends Record<string, IDBValidKey> = never,
	> {
		key: Key;
		value: Value;
		indexes?: Indexes;
	}

	export type Schema = Record<string, Store<unknown, IDBValidKey, Record<string, IDBValidKey>>>;
}

type StoreDefinition = DB.Store<unknown, IDBValidKey, Record<string, IDBValidKey>>;
type SchemaDefinition<Schema> = { [Name in keyof Schema]: StoreDefinition };

export type StoreName<Schema> = Extract<keyof Schema, string>;
export type StoreKey<Store extends StoreDefinition> = Store["key"];
export type StoreValue<Store extends StoreDefinition> = Store["value"];

export interface OperationOptions {
	signal?: AbortSignal;
}

export interface MutationOptions extends OperationOptions, IDBTransactionOptions {}

export interface WriteOptions<Store extends StoreDefinition> extends MutationOptions {
	key?: StoreKey<Store>;
}

export interface GetAllOptions<Store extends StoreDefinition> extends OperationOptions {
	count?: number;
	query?: StoreKey<Store> | IDBKeyRange | null;
}

export interface CountOptions<Store extends StoreDefinition> extends OperationOptions {
	query?: StoreKey<Store> | IDBKeyRange | null;
}

export interface WatchAllOptions<Store extends StoreDefinition> {
	count?: Watchable<number | undefined>;
	query?: Watchable<StoreKey<Store> | IDBKeyRange | null | undefined>;
}

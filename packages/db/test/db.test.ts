import { Signal } from "@signal-tools/signal";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
	type CountOptions,
	DB,
	type GetAllOptions,
	type MutationOptions,
	type OperationOptions,
	type Query,
	type SharedDBChange,
	type SharedDBClient,
	type SharedDBSubscribeOptions,
	type SharedDBSubscriber,
	type SharedDBSubscription,
	type StoreKey,
	type StoreName,
	type StoreValue,
	type WriteOptions,
} from "../src/db.js";

interface User {
	id: string;
	name: string;
}

interface TestSchema {
	users: DB.Store<User, string, { byName: string }>;
	logs: DB.Store<string, number>;
}

const one = { id: "one", name: "One" };
const two = { id: "two", name: "Two" };

interface SubscriptionRecord {
	active: boolean;
	onError?: (error: Error) => void;
	onReady?: (revision: number) => void;
	storeNames: readonly StoreName<TestSchema>[];
	subscriber: SharedDBSubscriber<TestSchema>;
}

class FakeSharedDBClient {
	readonly calls: [string, ...unknown[]][] = [];
	readonly subscriptions: SubscriptionRecord[] = [];
	readonly users = new Map<string, User>();
	readonly logs = new Map<number, string>();
	readonly closed: Promise<void>;
	closeCalls = 0;
	unsubscribeCalls = 0;
	#resolveClosed!: () => void;

	constructor() {
		this.closed = new Promise((resolve) => {
			this.#resolveClosed = resolve;
		});
	}

	async get<Name extends StoreName<TestSchema>>(
		storeName: Name,
		key: StoreKey<TestSchema[Name]> | IDBKeyRange,
		options?: OperationOptions,
	): Promise<StoreValue<TestSchema[Name]> | undefined> {
		this.calls.push(["get", storeName, key, options]);
		const value = storeName === "users" ? this.users.get(key as string) : this.logs.get(key as number);

		return value as StoreValue<TestSchema[Name]> | undefined;
	}

	async getAll<Name extends StoreName<TestSchema>>(
		storeName: Name,
		options?: GetAllOptions<TestSchema[Name]>,
	): Promise<StoreValue<TestSchema[Name]>[]> {
		this.calls.push(["getAll", storeName, options]);
		const values = [...(storeName === "users" ? this.users.values() : this.logs.values())];

		return values.slice(0, options?.count) as StoreValue<TestSchema[Name]>[];
	}

	async getAllKeys<Name extends StoreName<TestSchema>>(
		storeName: Name,
		options?: GetAllOptions<TestSchema[Name]>,
	): Promise<StoreKey<TestSchema[Name]>[]> {
		this.calls.push(["getAllKeys", storeName, options]);
		const keys = [...(storeName === "users" ? this.users.keys() : this.logs.keys())];

		return keys.slice(0, options?.count) as StoreKey<TestSchema[Name]>[];
	}

	async has<Name extends StoreName<TestSchema>>(
		storeName: Name,
		key: StoreKey<TestSchema[Name]> | IDBKeyRange,
		options?: OperationOptions,
	): Promise<boolean> {
		this.calls.push(["has", storeName, key, options]);

		return storeName === "users" ? this.users.has(key as string) : this.logs.has(key as number);
	}

	async count<Name extends StoreName<TestSchema>>(
		storeName: Name,
		options?: CountOptions<TestSchema[Name]>,
	): Promise<number> {
		this.calls.push(["count", storeName, options]);

		return storeName === "users" ? this.users.size : this.logs.size;
	}

	async add<Name extends StoreName<TestSchema>>(
		storeName: Name,
		value: StoreValue<TestSchema[Name]>,
		options?: WriteOptions<TestSchema[Name]>,
	): Promise<StoreKey<TestSchema[Name]>> {
		this.calls.push(["add", storeName, value, options]);

		return (options?.key ?? (value as User).id) as StoreKey<TestSchema[Name]>;
	}

	async put<Name extends StoreName<TestSchema>>(
		storeName: Name,
		value: StoreValue<TestSchema[Name]>,
		options?: WriteOptions<TestSchema[Name]>,
	): Promise<StoreKey<TestSchema[Name]>> {
		this.calls.push(["put", storeName, value, options]);

		return (options?.key ?? (value as User).id) as StoreKey<TestSchema[Name]>;
	}

	async delete<Name extends StoreName<TestSchema>>(
		storeName: Name,
		key: StoreKey<TestSchema[Name]> | IDBKeyRange,
		options?: MutationOptions,
	): Promise<void> {
		this.calls.push(["delete", storeName, key, options]);
	}

	async clear<Name extends StoreName<TestSchema>>(storeName: Name, options?: MutationOptions): Promise<void> {
		this.calls.push(["clear", storeName, options]);
	}

	subscribe<const Names extends StoreName<TestSchema>>(
		storeNames: Names | readonly Names[],
		subscriber: SharedDBSubscriber<TestSchema, Names>,
		options?: SharedDBSubscribeOptions,
	): SharedDBSubscription {
		const record: SubscriptionRecord = {
			active: true,
			storeNames: typeof storeNames === "string" ? [storeNames] : storeNames,
			subscriber: subscriber as unknown as SharedDBSubscriber<TestSchema>,
			...(options?.onError === undefined ? {} : { onError: options.onError }),
			...(options?.onReady === undefined ? {} : { onReady: options.onReady }),
		};
		const unsubscribe = () => {
			if (!record.active) return;

			record.active = false;
			this.unsubscribeCalls++;
		};

		this.subscriptions.push(record);

		return {
			get active() {
				return record.active;
			},
			unsubscribe,
			[Symbol.dispose]: unsubscribe,
		};
	}

	close(reason?: unknown): void {
		this.calls.push(["close", reason]);
		this.closeCalls++;
		this.#resolveClosed();
	}

	[Symbol.dispose](): void {
		this.close();
	}

	ready(revision = 0): void {
		for (const subscription of this.subscriptions) {
			if (subscription.active) subscription.onReady?.(revision);
		}
	}

	emit(change: SharedDBChange<TestSchema>): void {
		for (const subscription of this.subscriptions) {
			if (subscription.active && subscription.storeNames.includes(change.store)) {
				subscription.subscriber(change);
			}
		}
	}

	fail(error: Error): void {
		for (const subscription of this.subscriptions) {
			if (subscription.active) subscription.onError?.(error);
		}
	}

	disconnect(): void {
		this.#resolveClosed();
	}
}

const waitFor = async (assertion: () => void): Promise<void> => {
	let failure: unknown;

	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			assertion();

			return;
		} catch (error) {
			failure = error;
			await new Promise((resolve) => setTimeout(resolve));
		}
	}

	throw failure;
};

describe("DB", () => {
	let database: DB<TestSchema>;
	let source: FakeSharedDBClient;

	beforeEach(() => {
		source = new FakeSharedDBClient();
		source.users.set(one.id, one);
		source.users.set(two.id, two);

		const typedSource: SharedDBClient<TestSchema> = source;

		database = new DB(typedSource);
	});

	afterEach(() => database.close());

	it("delegates typed point operations to the shared client", async () => {
		const signal = new AbortController().signal;

		expect(database.source).toBe(source);
		expect(await database.get("users", one.id, { signal })).toBe(one);
		expect(await database.getAll("users", { count: 1 })).toEqual([one]);
		expect(await database.getAllKeys("users", { count: 1 })).toEqual([one.id]);
		expect(await database.has("users", one.id)).toBe(true);
		expect(await database.count("users", { query: one.id })).toBe(2);
		expect(await database.add("users", one)).toBe(one.id);
		expect(await database.put("logs", "created", { durability: "strict", key: 1 })).toBe(1);
		await database.delete("users", one.id, { durability: "relaxed" });
		await database.clear("logs", { signal });

		expect(source.calls.map(([method]) => method)).toEqual([
			"get",
			"getAll",
			"getAllKeys",
			"has",
			"count",
			"add",
			"put",
			"delete",
			"clear",
		]);
		expectTypeOf(database.get("users", one.id)).toEqualTypeOf<Promise<User | undefined>>();
		expectTypeOf(database.getAllKeys("logs")).toEqualTypeOf<Promise<number[]>>();
		expectTypeOf(database.watch("users", one.id)).toEqualTypeOf<Query<User | undefined>>();
		expectTypeOf(DB.connect<TestSchema>).returns.toEqualTypeOf<DB<TestSchema>>();

		const invalidTypes = () => {
			// @ts-expect-error Unknown store.
			database.get("missing", "one");
			// @ts-expect-error Wrong key type.
			database.watch("logs", "one");
			// @ts-expect-error Wrong value type.
			database.put("logs", 1, { key: 1 });
		};

		expectTypeOf(invalidTypes).toBeFunction();
	});

	it("registers a ready-gated subscription before the initial read", async () => {
		const query = database.watch("users", one.id);

		expect(Signal.isComputed(query)).toBe(true);
		expect(query.get()).toEqual({ status: "pending" });
		expect(source.subscriptions).toHaveLength(1);
		expect(source.calls).toHaveLength(0);

		source.ready(4);
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: one }));
		expect(source.calls).toEqual([["get", "users", one.id, undefined]]);
	});

	it("refreshes after subscribed committed changes", async () => {
		const query = database.watch("users", one.id);

		source.ready();
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: one }));

		const updated = { ...one, name: "Updated" };

		source.users.set(one.id, updated);
		source.emit({ kind: "added", key: one.id, revision: 1, store: "users", value: updated });
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: updated }));
	});

	it("tracks reactive keys while the subscription is becoming ready", async () => {
		const key = new Signal.State(one.id);
		const query = database.watch("users", key);

		key.set(two.id);
		await Promise.resolve();
		source.ready();
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: two }));

		expect(source.calls.map(([, , calledKey]) => calledKey)).toEqual([one.id, two.id]);
	});

	it("publishes subscription errors as query state", async () => {
		const failure = new Error("Subscription failed");
		const query = database.watchAll("users");

		source.fail(failure);
		await waitFor(() => expect(query.get()).toEqual({ status: "error", error: failure }));
	});

	it("supports explicit query and store refreshes", async () => {
		const query = database.watch("users", one.id);

		source.ready();
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: one }));

		const refreshed = { ...one, name: "Explicit" };

		source.users.set(one.id, refreshed);
		await query.refresh();
		expect(query.get()).toEqual({ status: "ready", value: refreshed });

		source.users.set(one.id, one);
		database.invalidate("users");
		await waitFor(() => expect(query.get()).toEqual({ status: "ready", value: one }));
	});

	it("cleans up subscriptions on query, database, and source disposal", async () => {
		const key = new Signal.State(one.id);
		const query = database.watch("users", key);

		expect(Signal.subtle.hasSinks(key)).toBe(true);
		query.dispose();
		query.dispose();
		expect(source.unsubscribeCalls).toBe(1);
		expect(Signal.subtle.hasSinks(key)).toBe(false);
		await expect(query.refresh()).rejects.toMatchObject({ name: "InvalidStateError" });

		const otherKey = new Signal.State(one.id);
		database.watch("users", otherKey);
		database.close("done");
		expect(source.closeCalls).toBe(1);
		expect(source.unsubscribeCalls).toBe(2);
		expect(Signal.subtle.hasSinks(otherKey)).toBe(false);

		const disconnected = new FakeSharedDBClient();
		const disconnectedDB = new DB<TestSchema>(disconnected);
		const disconnectedKey = new Signal.State(one.id);

		disconnectedDB.watch("users", disconnectedKey);
		disconnected.disconnect();
		await Promise.resolve();
		expect(disconnected.unsubscribeCalls).toBe(1);
		expect(Signal.subtle.hasSinks(disconnectedKey)).toBe(false);
	});
});

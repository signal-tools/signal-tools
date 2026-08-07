import { Signal } from "@signal-tools/signal";

import { arrayIndexOf, type VersionSignal, versionSignal } from "./internal.js";

/** An Array with lazy signal-backed index and collection reads. */
export const SignalArray = function SignalArray<Value = unknown>(values: readonly Value[] = []): SignalArray<Value> {
	return new Proxy(values.slice(), new SignalArrayHandler());
} as unknown as {
	new <Value = unknown>(values?: readonly Value[]): SignalArray<Value>;
	readonly prototype: SignalArray;
};

Object.setPrototypeOf(SignalArray.prototype, Array.prototype);

class SignalArrayHandler<Value> implements ProxyHandler<ArrayTarget<Value>> {
	#signals: Map<Key, VersionSignal> | undefined;
	#methods: Map<Key, ArrayMethod> | undefined;

	get(target: ArrayTarget<Value>, key: Key, receiver: SignalArray<Value>): unknown {
		const index = arrayIndexOf(key);

		if (index !== undefined) {
			this.#consume(index);
			return target[index];
		}

		if (key === "length") {
			this.#consume(key);
			return target.length;
		}

		if (collectionMethods.has(key)) {
			return this.#collectionMethod(target, key, receiver);
		}

		return target[key];
	}

	set(target: ArrayTarget<Value>, key: Key, value: Value): boolean {
		const index = arrayIndexOf(key);

		if (index !== undefined) {
			return this.#setIndex(target, key, index, value);
		}

		if (key === "length") {
			return this.#setLength(target, value);
		}

		target[key] = value;
		return true;
	}

	deleteProperty(target: ArrayTarget<Value>, key: Key): boolean {
		const index = arrayIndexOf(key);
		const present = Object.hasOwn(target, key);
		const result = Reflect.deleteProperty(target, key);

		if (result && present) {
			this.#dirty(index ?? key);
			this.#dirty(collectionKey);
		}

		return result;
	}

	getPrototypeOf(): object {
		return SignalArray.prototype;
	}

	#consume(key: Key): void {
		let signal = this.#signals?.get(key);

		if (signal !== undefined) {
			signal.get();
			return;
		}

		if (Signal.subtle.currentComputed() === undefined) {
			return;
		}

		const signals = (this.#signals ??= new Map());
		signal = versionSignal();
		signals.set(key, signal);
		signal.get();
	}

	#dirty(key: Key): void {
		this.#signals?.get(key)?.set(undefined);
	}

	#collectionMethod(target: ArrayTarget<Value>, key: Key, receiver: SignalArray<Value>): ArrayMethod {
		const methods = (this.#methods ??= new Map());
		let method = methods.get(key);

		if (method === undefined) {
			const source = target[key] as ArrayMethod;
			method = (...args: unknown[]): unknown => {
				this.#consume(collectionKey);
				const ownerIndex = callbackOwnerIndexes.get(key);

				if (ownerIndex !== undefined && typeof args[0] === "function") {
					const callback = args[0] as ArrayMethod;
					args[0] = function (this: unknown, ...callbackArgs: unknown[]): unknown {
						callbackArgs[ownerIndex] = receiver;
						return Reflect.apply(callback, this, callbackArgs);
					};
				}

				return Reflect.apply(source, target, args);
			};
			methods.set(key, method);
		}

		return method;
	}

	#setIndex(target: ArrayTarget<Value>, key: Key, index: number, value: unknown): boolean {
		if (Object.is(target[index], value) && Object.hasOwn(target, key)) {
			return true;
		}

		const extendsArray = index >= target.length && index < 4_294_967_295;
		target[index] = value as Value;
		this.#dirty(index);
		this.#dirty(collectionKey);

		if (extendsArray) {
			this.#dirty("length");
		}

		return true;
	}

	#setLength(target: ArrayTarget<Value>, value: unknown): boolean {
		const oldLength = target.length;
		target.length = value as number;
		const length = target.length;

		if (length !== oldLength) {
			this.#dirty("length");
			this.#dirty(collectionKey);

			if (length < oldLength) {
				this.#dirtyTail(length);
			}
		}

		return true;
	}

	#dirtyTail(length: number): void {
		if (this.#signals === undefined) {
			return;
		}

		for (const key of this.#signals.keys()) {
			if (typeof key === "number" && key >= length) {
				this.#dirty(key);
			}
		}
	}
}

const collectionMethods = new Set<Key>([
	Symbol.iterator,
	"concat",
	"entries",
	"every",
	"filter",
	"find",
	"findIndex",
	"flat",
	"flatMap",
	"forEach",
	"includes",
	"indexOf",
	"join",
	"keys",
	"lastIndexOf",
	"map",
	"reduce",
	"reduceRight",
	"slice",
	"some",
	"values",
]);
const callbackOwnerIndexes = new Map<Key, number>([
	["every", 2],
	["filter", 2],
	["find", 2],
	["findIndex", 2],
	["flatMap", 2],
	["forEach", 2],
	["map", 2],
	["reduce", 3],
	["reduceRight", 3],
	["some", 2],
]);
const collectionKey = Symbol();

type ArrayMethod = (...args: unknown[]) => unknown;
type Key = number | string | symbol;
type ArrayTarget<Value> = Value[] & Record<Key, unknown>;

export interface SignalArray<Value = unknown> extends Array<Value> {}

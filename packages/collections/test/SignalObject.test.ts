import { Signal } from "@signal-tools/signal";
import { describe, expect, it } from "vitest";

import { SignalArray, SignalMap, SignalObject, SignalSet } from "../src/index.js";
import { watch } from "./watch.js";

describe("SignalObject", () => {
	it("copies initial values into a shallow plain record", () => {
		class Value {
			a = 1;

			get doubled(): number {
				return this.a * 2;
			}
		}

		const source = new Value();
		const object = new SignalObject(source);

		expect(object).not.toBe(source);
		expect(object).not.toBeInstanceOf(Value);
		expect(object.a).toBe(1);
		expect("doubled" in object).toBe(false);
	});

	it("creates records from string and symbol entries", () => {
		const symbol = Symbol("value");
		const object = SignalObject.fromEntries<PropertyKey | number>([
			["a", 1],
			[symbol, 2],
		]);

		expect(object.a).toBe(1);
		expect(Reflect.get(object, symbol)).toBe(2);
		expect(Reflect.ownKeys(object)).toEqual(["a", symbol]);
	});

	it("tracks symbol values and enumeration", () => {
		const symbol = Symbol("value");
		const object = new SignalObject({ [symbol]: 1 });
		let valueReads = 0;
		let keyReads = 0;
		const value = new Signal.Computed(() => {
			valueReads += 1;
			return object[symbol];
		});
		const keys = new Signal.Computed(() => {
			keyReads += 1;
			return Reflect.ownKeys(object);
		});

		expect(value.get()).toBe(1);
		expect(keys.get()).toEqual([symbol]);
		object[symbol] = 2;
		expect(value.get()).toBe(2);
		expect(keys.get()).toEqual([symbol]);
		expect(valueReads).toBe(2);
		expect(keyReads).toBe(1);
		delete object[symbol];
		expect(value.get()).toBeUndefined();
		expect(keys.get()).toEqual([]);
	});

	it("isolates property reads and ignores identical writes", () => {
		const object = new SignalObject({ a: 1, b: 2 });
		let reads = 0;
		const value = new Signal.Computed(() => {
			reads += 1;
			return object.a;
		});

		expect(value.get()).toBe(1);
		object.b = 3;
		object.a = 1;
		expect(value.get()).toBe(1);
		expect(reads).toBe(1);
		object.a = 4;
		expect(value.get()).toBe(4);
		expect(reads).toBe(2);
	});

	it("tracks has and ownKeys with structural isolation", () => {
		const object: Record<string, number> = new SignalObject({ a: 1 });
		let hasReads = 0;
		let keyReads = 0;
		const hasA = new Signal.Computed(() => {
			hasReads += 1;
			return "a" in object;
		});
		const keys = new Signal.Computed(() => {
			keyReads += 1;
			return Object.keys(object).join(",");
		});

		hasA.get();
		keys.get();
		object.a = 2;
		expect(hasA.get()).toBe(true);
		expect(keys.get()).toBe("a");
		expect(hasReads).toBe(1);
		expect(keyReads).toBe(1);

		object.b = 3;
		expect(keys.get()).toBe("a,b");
		expect(keyReads).toBe(2);
	});

	it("tracks deletion and re-addition", async () => {
		const object: { value?: number } = new SignalObject({ value: 1 });
		const values: Array<number | undefined> = [];
		const stop = watch(
			() => object.value,
			(value) => values.push(value),
		);

		delete object.value;
		await Promise.resolve();
		object.value = 2;
		await Promise.resolve();

		expect(values).toEqual([undefined, 2]);
		stop();
	});

	it("does not deeply proxy nested values", () => {
		const nested = { value: 1 };
		const object = new SignalObject({ nested });

		expect(object.nested).toBe(nested);
	});

	it("uses the consumer Signal singleton for every collection", () => {
		const array = new SignalArray<number>();
		const map = new SignalMap<string, number>();
		const set = new SignalSet<number>();
		const object: Record<string, number> = new SignalObject();
		const sizes = new Signal.Computed(() => [array.length, map.size, set.size, Object.keys(object).length]);

		expect(sizes.get()).toEqual([0, 0, 0, 0]);
		array.push(1);
		map.set("a", 1);
		set.add(1);
		object.a = 1;
		expect(sizes.get()).toEqual([1, 1, 1, 1]);
	});
});

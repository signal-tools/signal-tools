import { Signal } from "@signal-tools/signal";
import { describe, expect, it } from "vitest";

import { SignalArray } from "../src/SignalArray.js";
import { watch } from "./watch.js";

describe("SignalArray", () => {
	it("preserves native identity and initial values", () => {
		const values = new SignalArray([1, 2]);

		expect(Array.isArray(values)).toBe(true);
		expect(values).toBeInstanceOf(Array);
		expect(values).toBeInstanceOf(SignalArray);
		expect(values).toEqual([1, 2]);
	});

	it("preserves non-index properties", () => {
		const values = new SignalArray([1, 2]) as number[] & Record<string, number>;

		values["01"] = 3;
		values["-1"] = 4;

		expect(values.length).toBe(2);
		expect(values["01"]).toBe(3);
		expect(values["-1"]).toBe(4);
	});

	it("isolates direct index reads and ignores identical writes", () => {
		const values = new SignalArray([1, 2]);
		let reads = 0;
		const first = new Signal.Computed(() => {
			reads += 1;
			return values[0];
		});

		expect(first.get()).toBe(1);
		values[1] = 3;
		expect(first.get()).toBe(1);
		values[0] = 1;
		expect(first.get()).toBe(1);
		expect(reads).toBe(1);
		values[0] = 4;
		expect(first.get()).toBe(4);
		expect(reads).toBe(2);
	});

	it("tracks collection reads and length changes", async () => {
		const values = new SignalArray([1]);
		const joined: string[] = [];
		const lengths: number[] = [];
		const stopJoined = watch(
			() => values.join(","),
			(value) => joined.push(value),
		);
		const stopLength = watch(
			() => values.length,
			(value) => lengths.push(value),
		);

		values.push(2);
		await Promise.resolve();

		expect(joined).toEqual(["1,2"]);
		expect(lengths).toEqual([2]);
		stopJoined();
		stopLength();
	});

	it("invalidates deleted, re-added, and truncated indexes", async () => {
		const values = new SignalArray<number>([1, 2, 3]);
		const second: Array<number | undefined> = [];
		const stop = watch(
			() => values[1],
			(value) => second.push(value),
		);

		delete values[1];
		await Promise.resolve();
		values[1] = 4;
		await Promise.resolve();
		values.length = 1;
		await Promise.resolve();

		expect(second).toEqual([undefined, 4, undefined]);
		stop();
	});

	it("returns stable collection method wrappers", () => {
		const values = new SignalArray([1]);

		expect(values.map).toBe(values.map);
		expect(values.values).toBe(values.values);
	});

	it("passes itself to collection callbacks", () => {
		const values = new SignalArray([1]);
		let owner: number[] | undefined;

		values.forEach((_value, _index, collection) => {
			owner = collection;
		});

		expect(owner).toBe(values);
	});
});

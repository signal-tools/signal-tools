import { Signal } from "@signal-tools/signal";
import { describe, expect, it } from "vitest";

import { SignalSet } from "../src/SignalSet.js";
import { watch } from "./watch.js";

describe("SignalSet", () => {
	it("preserves native identity, initial values, and callback ownership", () => {
		const set = new SignalSet([1, 2]);
		let owner: Set<number> | undefined;

		set.forEach((_value, _key, collection) => {
			owner = collection;
		});

		expect(set).toBeInstanceOf(Set);
		expect(Set.prototype.has.call(set, 1)).toBe(true);
		expect(Array.from(set)).toEqual([1, 2]);
		expect(owner).toBe(set);
	});

	it("isolates membership reads and ignores no-op mutations", () => {
		const set = new SignalSet([1]);
		let reads = 0;
		const member = new Signal.Computed(() => {
			reads += 1;
			return set.has(1);
		});

		expect(member.get()).toBe(true);
		set.add(1);
		set.add(2);
		set.delete(3);
		expect(member.get()).toBe(true);
		expect(reads).toBe(1);
	});

	it("tracks iteration and size changes", async () => {
		const set = new SignalSet([1]);
		const values: string[] = [];
		const stop = watch(
			() => `${set.size}:${Array.from(set).join(",")}`,
			(value) => values.push(value),
		);

		set.add(2);
		await Promise.resolve();
		set.delete(1);
		await Promise.resolve();

		expect(values).toEqual(["2:1,2", "1:2"]);
		stop();
	});

	it("re-tracks membership after delete, clear, and re-add", async () => {
		const set = new SignalSet([1]);
		const values: boolean[] = [];
		const stop = watch(
			() => set.has(1),
			(value) => values.push(value),
		);

		set.delete(1);
		await Promise.resolve();
		set.add(1);
		await Promise.resolve();
		set.clear();
		await Promise.resolve();
		set.add(1);
		await Promise.resolve();

		expect(values).toEqual([false, true, false, true]);
		stop();
	});
});

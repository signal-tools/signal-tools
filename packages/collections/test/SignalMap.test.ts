import { Signal } from "@signal-tools/signal";
import { describe, expect, it } from "vitest";

import { SignalMap } from "../src/SignalMap.js";
import { watch } from "./watch.js";

describe("SignalMap", () => {
	it("preserves native identity, initial values, and callback ownership", () => {
		const map = new SignalMap([["a", 1]]);
		let owner: Map<string, number> | undefined;

		map.forEach((_value, _key, collection) => {
			owner = collection;
		});

		expect(map).toBeInstanceOf(Map);
		expect(Map.prototype.get.call(map, "a")).toBe(1);
		expect(owner).toBe(map);
	});

	it("isolates key values and ignores no-op mutations", () => {
		const map = new SignalMap([
			["a", 1],
			["b", 2],
		]);
		let reads = 0;
		const value = new Signal.Computed(() => {
			reads += 1;
			return map.get("a");
		});

		expect(value.get()).toBe(1);
		map.set("b", 3);
		map.set("a", 1);
		map.delete("missing");
		expect(value.get()).toBe(1);
		expect(reads).toBe(1);
	});

	it("separates value changes from presence and structure", () => {
		const map = new SignalMap([["a", 1]]);
		let valueReads = 0;
		let structureReads = 0;
		const value = new Signal.Computed(() => {
			valueReads += 1;
			return map.get("a");
		});
		const structure = new Signal.Computed(() => {
			structureReads += 1;
			return [map.has("a"), map.size, ...map.keys()] as const;
		});

		value.get();
		structure.get();
		map.set("a", 2);

		expect(value.get()).toBe(2);
		expect(structure.get()).toEqual([true, 1, "a"]);
		expect(valueReads).toBe(2);
		expect(structureReads).toBe(1);
	});

	it("tracks iteration content changes", async () => {
		const map = new SignalMap([["a", 1]]);
		const entries: string[] = [];
		const stop = watch(
			() => Array.from(map, ([key, value]) => `${key}:${value}`).join(","),
			(value) => entries.push(value),
		);

		map.set("a", 2);
		await Promise.resolve();
		map.set("b", 3);
		await Promise.resolve();

		expect(entries).toEqual(["a:2", "a:2,b:3"]);
		stop();
	});

	it("re-tracks keys after delete, clear, and re-add", async () => {
		const map = new SignalMap([["a", 1]]);
		const values: Array<number | undefined> = [];
		const stop = watch(
			() => map.get("a"),
			(value) => values.push(value),
		);

		map.delete("a");
		await Promise.resolve();
		map.set("a", 2);
		await Promise.resolve();
		map.clear();
		await Promise.resolve();
		map.set("a", 3);
		await Promise.resolve();

		expect(values).toEqual([undefined, 2, undefined, 3]);
		stop();
	});
});

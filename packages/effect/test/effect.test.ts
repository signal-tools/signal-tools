import { Signal } from "@signal-tools/signal";
import { describe, expect, it, vi } from "vitest";

import { createEffect, effect } from "../src/index.js";

const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

describe("effect", () => {
	it("runs synchronously and batches invalidations onto one microtask", async () => {
		const value = new Signal.State(0);
		const values: number[] = [];
		const dispose = effect(() => values.push(value.get()));

		expect(values).toEqual([0]);

		value.set(1);
		value.set(2);
		expect(values).toEqual([0]);

		await flush();
		expect(values).toEqual([0, 2]);

		dispose();
	});

	it("tracks changing dependencies", async () => {
		const useLeft = new Signal.State(true);
		const left = new Signal.State("left");
		const right = new Signal.State("right");
		const values: string[] = [];
		const dispose = effect(() => values.push((useLeft.get() ? left : right).get()));

		left.set("left-2");
		await flush();
		useLeft.set(false);
		await flush();
		left.set("left-3");
		await flush();
		right.set("right-2");
		await flush();

		expect(values).toEqual(["left", "left-2", "right", "right-2"]);

		dispose();
	});

	it("schedules effects invalidated by another effect during a flush", async () => {
		const trigger = new Signal.State(0);
		const downstream = new Signal.State(0);
		const values: number[] = [];
		const disposeTrigger = effect(() => {
			const value = trigger.get();

			if (value) downstream.set(value);
		});
		const disposeDownstream = effect(() => values.push(downstream.get()));

		trigger.set(1);
		await flush();
		expect(values).toEqual([0, 1]);

		disposeTrigger();
		disposeDownstream();
	});

	it("disposes idempotently and cancels a queued run", async () => {
		const value = new Signal.State(0);
		const values: number[] = [];
		const dispose = effect(() => values.push(value.get()));

		value.set(1);
		dispose();
		dispose();
		await flush();
		value.set(2);
		await flush();

		expect(values).toEqual([0]);
	});

	it("skips an effect disposed by an earlier effect in the same flush", async () => {
		const first = new Signal.State(0);
		const second = new Signal.State(0);
		const secondValues: number[] = [];
		let shouldDispose = false;
		let disposeSecond = (): void => {};
		const disposeFirst = effect(() => {
			first.get();

			if (shouldDispose) disposeSecond();
		});
		disposeSecond = effect(() => secondValues.push(second.get()));

		shouldDispose = true;
		first.set(1);
		second.set(1);
		await flush();

		expect(secondValues).toEqual([0]);

		disposeFirst();
	});

	it("drains other effects, rearms, and recovers after an effect throws", () => {
		const tasks: Array<() => void> = [];
		vi.stubGlobal("queueMicrotask", (task: () => void) => tasks.push(task));

		const first = new Signal.State(0);
		const second = new Signal.State(0);
		const secondValues: number[] = [];
		let shouldThrow = false;
		const disposeFirst = effect(() => {
			first.get();

			if (shouldThrow) throw new Error("effect failed");
		});
		const disposeSecond = effect(() => secondValues.push(second.get()));

		try {
			shouldThrow = true;
			first.set(1);
			second.set(1);

			expect(tasks).toHaveLength(1);
			expect(() => tasks.shift()?.()).toThrow("effect failed");
			expect(secondValues).toEqual([0, 1]);

			shouldThrow = false;
			first.set(2);
			second.set(2);

			expect(tasks).toHaveLength(1);
			expect(() => tasks.shift()?.()).not.toThrow();
			expect(secondValues).toEqual([0, 1, 2]);
		} finally {
			disposeFirst();
			disposeSecond();
			vi.unstubAllGlobals();
		}
	});

	it("disposes an effect whose initial run throws", () => {
		const value = new Signal.State(0);

		expect(() =>
			effect(() => {
				value.get();
				throw new Error("initial failure");
			}),
		).toThrow("initial failure");
		expect(Signal.subtle.hasSinks(value)).toBe(false);
	});

	it("aggregates multiple failures after draining the queue", () => {
		const tasks: Array<() => void> = [];
		vi.stubGlobal("queueMicrotask", (task: () => void) => tasks.push(task));

		const first = new Signal.State(0);
		const second = new Signal.State(0);
		let shouldThrow = false;
		const disposeFirst = effect(() => {
			first.get();

			if (shouldThrow) throw new Error("first failed");
		});
		const disposeSecond = effect(() => {
			second.get();

			if (shouldThrow) throw new Error("second failed");
		});

		try {
			shouldThrow = true;
			first.set(1);
			second.set(1);

			expect(tasks).toHaveLength(1);
			expect(() => tasks.shift()?.()).toThrow(AggregateError);
		} finally {
			disposeFirst();
			disposeSecond();
			vi.unstubAllGlobals();
		}
	});
});

describe("createEffect", () => {
	it("stays dormant until started and starts only once", async () => {
		const value = new Signal.State(0);
		const values: number[] = [];
		const controller = createEffect(() => values.push(value.get()));

		value.set(1);
		expect(values).toEqual([]);

		controller.start();
		controller.start();
		expect(values).toEqual([1]);

		value.set(2);
		await flush();
		expect(values).toEqual([1, 2]);

		controller.dispose();
	});

	it("can be permanently disposed before its initial run", () => {
		let runs = 0;
		const controller = createEffect(() => runs++);

		controller.dispose();
		controller.start();

		expect(runs).toBe(0);
	});

	it("can be disposed by ownership registered before start", () => {
		const cleanups = new Set<() => void>();
		let runs = 0;
		const controller = createEffect(() => {
			runs++;

			for (const cleanup of cleanups) cleanup();
		});

		cleanups.add(controller.dispose);
		controller.start();

		expect(runs).toBe(1);
	});
});

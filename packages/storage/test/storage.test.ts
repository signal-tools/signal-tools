import { Signal } from "@signal-tools/signal";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { Storage, type StorageChange } from "../src/storage.js";

interface TestStorage {
	theme: "dark" | "light";
	token: string;
}

describe("Storage", () => {
	let storage: Storage<TestStorage>;

	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		storage = new Storage<TestStorage>();
	});

	it("gets, checks, sets, and deletes typed values", () => {
		expect(storage.get("theme")).toBeNull();
		expect(storage.has("theme")).toBe(false);
		expect(storage.set("theme", "dark")).toBe(true);
		expect(storage.get("theme")).toBe("dark");
		expect(storage.has("theme")).toBe(true);
		expect(storage.delete("theme")).toBe(true);
		expect(storage.get("theme")).toBeNull();
		expect(storage.delete("theme")).toBe(false);

		expectTypeOf(storage.get("theme")).toEqualTypeOf<"dark" | "light" | null>();
	});

	it("subscribes to every changed write in the current document", () => {
		const subscriber = vi.fn<(change: StorageChange<"theme", "dark" | "light">) => void>();
		const unsubscribe = storage.subscribe("theme", subscriber);

		expect(storage.set("theme", "dark")).toBe(true);
		expect(storage.set("theme", "dark")).toBe(false);
		expect(storage.set("theme", "light")).toBe(true);
		expect(storage.delete("theme")).toBe(true);
		expect(subscriber).toHaveBeenCalledTimes(3);
		expect(subscriber).toHaveBeenNthCalledWith(1, { kind: "added", key: "theme", value: "dark" });
		expect(subscriber).toHaveBeenNthCalledWith(2, {
			kind: "updated",
			key: "theme",
			previous: "dark",
			value: "light",
		});
		expect(subscriber).toHaveBeenNthCalledWith(3, { kind: "removed", key: "theme", previous: "light" });

		unsubscribe();
		storage.set("theme", "light");
		expect(subscriber).toHaveBeenCalledTimes(3);
	});

	it("uses an active subscription snapshot for reentrant delivery", () => {
		const calls: string[] = [];
		const added = vi.fn(() => calls.push("added"));
		let addOnNextOccurrence = true;
		let unsubscribeRemoved = () => {};

		storage.subscribe("theme", () => {
			calls.push("first");
			unsubscribeRemoved();

			if (addOnNextOccurrence) {
				addOnNextOccurrence = false;
				storage.subscribe("theme", added);
			}
		});
		unsubscribeRemoved = storage.subscribe("theme", () => calls.push("removed"));

		storage.set("theme", "dark");
		expect(calls).toEqual(["first"]);

		storage.set("theme", "light");
		expect(calls).toEqual(["first", "first", "added"]);
		expect(added).toHaveBeenCalledOnce();
	});

	it("bounds nested occurrences independently", () => {
		const calls: string[] = [];
		let nested = false;

		storage.subscribe("theme", (change) => {
			calls.push(`first:${"value" in change ? change.value : change.kind}`);

			if (!nested) {
				nested = true;
				storage.subscribe("theme", (nestedChange) => {
					calls.push(`added:${"value" in nestedChange ? nestedChange.value : nestedChange.kind}`);
				});
				storage.set("theme", "light");
			}
		});
		storage.subscribe("theme", (change) => {
			calls.push(`second:${"value" in change ? change.value : change.kind}`);
		});

		storage.set("theme", "dark");

		expect(calls).toEqual(["first:dark", "first:light", "second:light", "added:light", "second:dark"]);
	});

	it("keeps duplicate registrations distinct and defers recreated buckets", () => {
		const calls: string[] = [];
		const duplicate = vi.fn(() => calls.push("duplicate"));
		let unsubscribeFirst = () => {};
		let unsubscribeSecond = () => {};

		unsubscribeFirst = storage.subscribe("theme", () => {
			calls.push("first");
			unsubscribeFirst();
			unsubscribeSecond();
			storage.subscribe("theme", duplicate);
			storage.subscribe("theme", duplicate);
		});
		unsubscribeSecond = storage.subscribe("theme", () => calls.push("removed"));

		storage.set("theme", "dark");
		expect(calls).toEqual(["first"]);

		storage.set("theme", "light");
		expect(duplicate).toHaveBeenCalledTimes(2);
	});

	it("preserves registration order and occurrences after re-subscribing", () => {
		const calls: string[] = [];
		const first = () => calls.push("first");
		const second = () => calls.push("second");
		const unsubscribeFirst = storage.subscribe("theme", first);
		const unsubscribeSecond = storage.subscribe("theme", second);

		storage.set("theme", "dark");
		unsubscribeFirst();
		unsubscribeFirst();
		const unsubscribeFirstAgain = storage.subscribe("theme", first);
		storage.set("theme", "light");
		unsubscribeSecond();
		unsubscribeFirstAgain();
		storage.delete("theme");

		expect(calls).toEqual(["first", "second", "second", "first"]);
	});

	it("runs later subscribers before rethrowing one error by identity", () => {
		const error = new Error("subscriber failed");
		const laterSubscriber = vi.fn();

		const unsubscribeFailing = storage.subscribe("theme", () => {
			throw error;
		});
		const unsubscribeLater = storage.subscribe("theme", laterSubscriber);

		let thrown: unknown;
		try {
			storage.set("theme", "dark");
		} catch (caught) {
			thrown = caught;
		}
		unsubscribeFailing();
		unsubscribeLater();

		expect(thrown).toBe(error);
		expect(laterSubscriber).toHaveBeenCalledOnce();
		expect(storage.get("theme")).toBe("dark");
		expect(localStorage.getItem("theme")).toBe("dark");
	});

	it("aggregates multiple subscriber errors in delivery order", () => {
		const nestedError = new AggregateError([new Error("nested")]);
		const laterError = new Error("later");
		const successfulSubscriber = vi.fn();

		const unsubscribeNested = storage.subscribe("theme", () => {
			throw nestedError;
		});
		const unsubscribeSuccessful = storage.subscribe("theme", successfulSubscriber);
		const unsubscribeLater = storage.subscribe("theme", () => {
			throw laterError;
		});

		let thrown: unknown;
		try {
			storage.set("theme", "dark");
		} catch (caught) {
			thrown = caught;
		}
		unsubscribeNested();
		unsubscribeSuccessful();
		unsubscribeLater();

		expect(successfulSubscriber).toHaveBeenCalledOnce();
		expect(thrown).toBeInstanceOf(AggregateError);
		expect((thrown as AggregateError).errors).toEqual([nestedError, laterError]);
	});

	it("subscribes to matching storage events from other documents", () => {
		const subscriber = vi.fn();
		storage.subscribe("theme", subscriber);

		window.dispatchEvent(
			new StorageEvent("storage", {
				key: "theme",
				oldValue: "light",
				newValue: "dark",
				storageArea: localStorage,
				url: location.href,
			}),
		);

		expect(subscriber).toHaveBeenCalledOnce();
		expect(subscriber).toHaveBeenCalledWith({
			kind: "updated",
			key: "theme",
			previous: "light",
			value: "dark",
		});
	});

	it("subscribes to writes from another same-origin document", async () => {
		const frame = document.createElement("iframe");
		document.body.append(frame);

		try {
			const change = new Promise<StorageChange<"theme", "dark" | "light">>((resolve) => {
				storage.subscribe("theme", resolve);
			});

			frame.contentWindow?.localStorage.setItem("theme", "dark");

			await expect(change).resolves.toEqual({ kind: "added", key: "theme", value: "dark" });
		} finally {
			frame.remove();
		}
	});

	it("updates a watched signal after writes from another same-origin document", async () => {
		const frame = document.createElement("iframe");
		const current = storage.watch("theme");

		document.body.append(frame);

		try {
			frame.contentWindow?.localStorage.setItem("theme", "dark");
			await expect.poll(() => current.get()).toBe("dark");

			frame.contentWindow?.localStorage.removeItem("theme");
			await expect.poll(() => current.get()).toBeNull();
		} finally {
			current.dispose();
			frame.remove();
		}
	});

	it("ignores other keys and storage areas", () => {
		const subscriber = vi.fn();
		storage.subscribe("theme", subscriber);

		for (const init of [
			{ key: "token", storageArea: localStorage },
			{ key: "theme", storageArea: sessionStorage },
		]) {
			window.dispatchEvent(new StorageEvent("storage", init));
		}

		expect(subscriber).not.toHaveBeenCalled();
	});

	it("invalidates every subscribed key after clear events", () => {
		const subscriber = vi.fn();
		storage.subscribe("theme", subscriber);
		storage.subscribe("token", subscriber);

		window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));

		expect(subscriber).toHaveBeenCalledTimes(2);
		expect(subscriber).toHaveBeenNthCalledWith(1, { kind: "invalidated", key: "theme" });
		expect(subscriber).toHaveBeenNthCalledWith(2, { kind: "invalidated", key: "token" });
	});

	it("invalidates every snapshotted key before surfacing clear errors", () => {
		const addEventListener = vi.spyOn(window, "addEventListener");
		const error = new Error("theme failed");
		const tokenSubscriber = vi.fn();

		try {
			const unsubscribeTheme = storage.subscribe("theme", () => {
				throw error;
			});
			const unsubscribeToken = storage.subscribe("token", tokenSubscriber);

			const listener = addEventListener.mock.calls.find(([type]) => type === "storage")?.[1] as EventListener;
			let thrown: unknown;

			try {
				listener(new StorageEvent("storage", { key: null, storageArea: localStorage }));
			} catch (caught) {
				thrown = caught;
			}
			unsubscribeTheme();
			unsubscribeToken();

			expect(thrown).toBe(error);
			expect(tokenSubscriber).toHaveBeenCalledWith({ kind: "invalidated", key: "token" });
		} finally {
			addEventListener.mockRestore();
		}
	});

	it("unsubscribes when its signal aborts", () => {
		const controller = new AbortController();
		const subscriber = vi.fn();

		storage.subscribe("token", subscriber, { signal: controller.signal });
		controller.abort();
		storage.set("token", "secret");

		expect(subscriber).not.toHaveBeenCalled();
	});

	it("does not start an already-aborted subscription", () => {
		const controller = new AbortController();
		const subscriber = vi.fn();

		controller.abort();
		const unsubscribe = storage.subscribe("token", subscriber, { signal: controller.signal });
		storage.set("token", "secret");
		unsubscribe();

		expect(subscriber).not.toHaveBeenCalled();
	});

	it("listens for browser events only while the subscription map is nonempty", () => {
		const addEventListener = vi.spyOn(window, "addEventListener");
		const removeEventListener = vi.spyOn(window, "removeEventListener");
		const controller = new AbortController();

		try {
			const unsubscribeThemeFirst = storage.subscribe("theme", vi.fn());
			const unsubscribeThemeSecond = storage.subscribe("theme", vi.fn());
			const unsubscribeToken = storage.subscribe("token", vi.fn());
			const unsubscribeAborted = storage.subscribe("token", vi.fn(), { signal: controller.signal });

			expect(addEventListener.mock.calls.filter(([type]) => type === "storage")).toHaveLength(1);

			unsubscribeThemeFirst();
			unsubscribeThemeFirst();
			controller.abort();
			unsubscribeAborted();
			expect(removeEventListener.mock.calls.filter(([type]) => type === "storage")).toHaveLength(0);

			unsubscribeThemeSecond();
			unsubscribeToken();
			unsubscribeToken();
			expect(removeEventListener.mock.calls.filter(([type]) => type === "storage")).toHaveLength(1);

			const unsubscribeNextLifecycle = storage.subscribe("theme", vi.fn());
			expect(addEventListener.mock.calls.filter(([type]) => type === "storage")).toHaveLength(2);

			unsubscribeNextLifecycle();
			expect(removeEventListener.mock.calls.filter(([type]) => type === "storage")).toHaveLength(2);
		} finally {
			addEventListener.mockRestore();
			removeEventListener.mockRestore();
		}
	});

	it("watches current storage state with a read-only computed signal", () => {
		const current = storage.watch("theme");

		expect(Signal.isComputed(current)).toBe(true);
		expect("set" in current).toBe(false);
		expect(current.get()).toBeNull();
		expectTypeOf(current.get()).toEqualTypeOf<"dark" | "light" | null>();
		expectTypeOf(current).not.toHaveProperty("set");
		expectTypeOf(current.refresh).toEqualTypeOf<() => void>();

		storage.set("theme", "dark");
		expect(current.get()).toBe("dark");

		current.dispose();
		current[Symbol.dispose]();
		storage.set("theme", "light");
		expect(current.get()).toBe("dark");
	});

	it("refreshes active watches synchronously and freezes disposed watches", () => {
		const get = vi.spyOn(storage, "get");
		const current = storage.watch("theme");

		expect(get).toHaveBeenCalledOnce();
		get.mockClear();

		storage.set("theme", "dark");
		expect(get).toHaveBeenCalledOnce();
		expect(current.get()).toBe("dark");

		storage.source.setItem("theme", "light");
		expect(current.get()).toBe("dark");
		expect(current.refresh()).toBeUndefined();
		expect(get).toHaveBeenCalledTimes(2);
		expect(current.get()).toBe("light");

		storage.source.clear();
		window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
		expect(get).toHaveBeenCalledTimes(3);
		expect(current.get()).toBeNull();

		current.dispose();
		current.dispose();
		current[Symbol.dispose]();
		storage.source.setItem("theme", "dark");
		current.refresh();
		expect(get).toHaveBeenCalledTimes(3);
		expect(current.get()).toBeNull();
	});

	it("coalesces watched state without coalescing subscriptions", () => {
		const subscriber = vi.fn();
		const current = storage.watch("theme");
		const notify = vi.fn();
		const watcher = new Signal.subtle.Watcher(notify);

		storage.subscribe("theme", subscriber);
		current.get();
		watcher.watch(current);
		storage.set("theme", "dark");
		storage.set("theme", "light");

		expect(subscriber).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledOnce();
		expect(current.get()).toBe("light");

		watcher.unwatch(current);
		current.dispose();
	});

	it("refreshes watched state after clear invalidation", () => {
		storage.set("theme", "dark");
		const current = storage.watch("theme");

		localStorage.clear();
		window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));

		expect(current.get()).toBeNull();
		current.dispose();
	});

	it("can wrap sessionStorage", () => {
		const session = new Storage<TestStorage>("session");

		session.set("token", "session-token");

		expect(session.get("token")).toBe("session-token");
		expect(localStorage.getItem("token")).toBeNull();
	});
});

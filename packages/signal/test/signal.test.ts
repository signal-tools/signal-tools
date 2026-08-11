import { describe, expect, it } from "vitest";
import { Signal } from "../src/signal.ts";

describe("Signal.State", () => {
	it("creates with initial value", () => {
		expect(new Signal.State(42).get()).toBe(42);
	});

	it("updates value with set()", () => {
		const s = new Signal.State(1);
		s.set(2);
		expect(s.get()).toBe(2);
	});

	it("uses custom equals function", () => {
		let eqCalls = 0;
		let receiver: Signal.State<{ x: number }> | undefined;
		const s = new Signal.State(
			{ x: 1 },
			{
				equals(a, b) {
					eqCalls++;
					receiver = this;
					return a.x === b.x;
				},
			},
		);
		s.set({ x: 1 });
		expect(eqCalls).toBe(1);
		expect(receiver).toBe(s);
	});

	it("skips updates when value is equal", () => {
		const s = new Signal.State(1);
		let runs = 0;
		const c = new Signal.Computed(() => (runs++, s.get() * 2));
		c.get();
		s.set(1);
		c.get();
		expect(runs).toBe(1);
	});
});

describe("Signal.Computed", () => {
	it("computes derived value", () => {
		const a = new Signal.State(2);
		const b = new Signal.State(3);
		expect(new Signal.Computed(() => a.get() + b.get()).get()).toBe(5);
	});

	it("is lazy - not computed until read", () => {
		let ran = false;
		const c = new Signal.Computed(() => (ran = true));
		expect(ran).toBe(false);
		c.get();
		expect(ran).toBe(true);
	});

	it("caches computed value", () => {
		let runs = 0;
		const c = new Signal.Computed(() => (runs++, 1));
		c.get();
		c.get();
		c.get();
		expect(runs).toBe(1);
	});

	it("recomputes when dependency changes", () => {
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get() * 2);
		expect(c.get()).toBe(2);
		s.set(5);
		expect(c.get()).toBe(10);
	});

	it("tracks dynamic dependencies", () => {
		const flag = new Signal.State(true);
		const a = new Signal.State(1);
		const b = new Signal.State(2);
		let runs = 0;
		const c = new Signal.Computed(() => (runs++, flag.get() ? a.get() : b.get()));

		c.get();
		expect(runs).toBe(1);

		b.set(3); // b not tracked
		c.get();
		expect(runs).toBe(1);

		flag.set(false); // now tracks b instead of a
		c.get();
		expect(runs).toBe(2);

		a.set(10); // a no longer tracked
		c.get();
		expect(runs).toBe(2);
	});

	it("detects cycles and throws", () => {
		const c: Signal.Computed<number> = new Signal.Computed(() => c.get());
		expect(() => c.get()).toThrow(/no cycle/i);
	});

	it("caches and rethrows errors", () => {
		let throws = 0;
		const c = new Signal.Computed(() => {
			throws++;
			throw new Error("test");
		});
		expect(() => c.get()).toThrow(/test/);
		expect(() => c.get()).toThrow(/test/);
		expect(throws).toBe(1);
	});

	it.each([undefined, null, false, 0, ""])("caches and rethrows the falsy value %j", (thrownValue) => {
		let didThrow = false;
		const c = new Signal.Computed(() => {
			throw thrownValue;
		});

		try {
			c.get();
		} catch (error) {
			didThrow = true;
			expect(error).toBe(thrownValue);
		}

		expect(didThrow).toBe(true);
	});

	it("uses custom equals function", () => {
		const s = new Signal.State(1);
		let runs = 0;
		let receiver: Signal.Computed<{ val: number }> | undefined;
		const c = new Signal.Computed(() => ({ val: s.get() }), {
			equals(a, b) {
				receiver = this;
				return a.val === b.val;
			},
		});
		const d = new Signal.Computed(() => (runs++, c.get().val));
		d.get();
		s.set(2);
		s.set(1);
		d.get();
		expect(runs).toBe(1);
		expect(receiver).toBe(c);
	});

	it("recovers from cached errors after a dependency changes", () => {
		const error = new Signal.State<unknown>(0);
		const c = new Signal.Computed(() => {
			const value = error.get();
			if (value !== null) throw value;
			return 1;
		});

		expect(() => c.get()).toThrow();
		error.set(null);
		expect(c.get()).toBe(1);
	});
});

describe("Signal.subtle.Watcher", () => {
	it("notifies when watched signal changes", () => {
		let notified = false;
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => (notified = true));
		w.watch(s);
		s.set(2);
		expect(notified).toBe(true);
	});

	it("coalesces direct State notifications until rearmed", () => {
		let calls = 0;
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => calls++);
		w.watch(s);

		s.set(2);
		s.set(3);
		expect(calls).toBe(1);

		w.watch();
		s.set(4);
		expect(calls).toBe(2);
	});

	it("calls notify with the Watcher receiver", () => {
		const s = new Signal.State(1);
		let receiver: Signal.subtle.Watcher | undefined;
		const w = new Signal.subtle.Watcher(function () {
			receiver = this;
		});
		w.watch(s);
		s.set(2);
		expect(receiver).toBe(w);
	});

	it("restores notification state and invokes every watcher when callbacks throw", () => {
		const s = new Signal.State(1);
		const errors = [new Error("first"), new Error("last")];
		const calls: number[] = [];
		new Signal.subtle.Watcher(() => {
			calls.push(1);
			throw errors[0];
		}).watch(s);
		new Signal.subtle.Watcher(() => calls.push(2)).watch(s);
		new Signal.subtle.Watcher(() => {
			calls.push(3);
			throw errors[1];
		}).watch(s);

		try {
			s.set(2);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(AggregateError);
			expect((error as AggregateError).errors).toEqual(errors);
		}

		expect(calls).toEqual([1, 2, 3]);
		expect(s.get()).toBe(2);
	});

	it("stops notifying after unwatch", () => {
		let calls = 0;
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => calls++);
		w.watch(s);
		s.set(2);
		w.unwatch(s);
		s.set(3);
		expect(calls).toBe(1);
	});

	it("returns pending computed signals via getPending()", () => {
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get() * 2);
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		c.get();
		s.set(2);
		expect(w.getPending()).toEqual([c]);
	});

	it("disallows signal reads during notify", () => {
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => expect(() => s.get()).toThrow(/unfrozen/i));
		w.watch(s);
		s.set(2);
	});

	it("disallows signal writes during notify", () => {
		const s = new Signal.State(1);
		const s2 = new Signal.State(0);
		const w = new Signal.subtle.Watcher(() => expect(() => s2.set(1)).toThrow(/unfrozen/i));
		w.watch(s);
		s.set(2);
	});

	it("does not notify on initial computation of watched computed", () => {
		let calls = 0;
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get() * 2);
		const w = new Signal.subtle.Watcher(() => calls++);

		w.watch(c);
		c.get();
		expect(calls).toBe(0);

		s.set(2);
		expect(calls).toBe(1);
	});
});

describe("Signal.isState / Signal.isComputed", () => {
	it("isState returns true only for State", () => {
		expect(Signal.isState(new Signal.State(1))).toBe(true);
		expect(Signal.isState(new Signal.Computed(() => 1))).toBe(false);
		expect(Signal.isState(new Signal.subtle.Watcher(() => {}))).toBe(false);
		expect(Signal.isState(null)).toBe(false);
		expect(Signal.isState(42)).toBe(false);
	});

	it("isComputed returns true only for Computed", () => {
		expect(Signal.isComputed(new Signal.Computed(() => 1))).toBe(true);
		expect(Signal.isComputed(new Signal.State(1))).toBe(false);
		expect(Signal.isComputed(new Signal.subtle.Watcher(() => {}))).toBe(false);
		expect(Signal.isComputed(null)).toBe(false);
		expect(Signal.isComputed(42)).toBe(false);
	});

	it("isWatcher returns true only for Watcher", () => {
		expect(Signal.isWatcher(new Signal.subtle.Watcher(() => {}))).toBe(true);
		expect(Signal.isWatcher(new Signal.State(1))).toBe(false);
		expect(Signal.isWatcher(new Signal.Computed(() => 1))).toBe(false);
		expect(Signal.isWatcher(null)).toBe(false);
	});

	it("rejects methods called with the wrong receiver", () => {
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => 1);

		expect(() => Signal.State.prototype.get.call(c)).toThrow(TypeError);
		expect(() => Signal.State.prototype.set.call(c, 2)).toThrow(TypeError);
		expect(() => Signal.Computed.prototype.get.call(s)).toThrow(TypeError);
	});
});

describe("Signal.subtle utilities", () => {
	it("untrack prevents dependency tracking", () => {
		const s = new Signal.State(1);
		let runs = 0;
		const c = new Signal.Computed(() => (runs++, Signal.subtle.untrack(() => s.get())));
		c.get();
		s.set(2);
		c.get();
		expect(runs).toBe(1);
	});

	it("currentComputed returns current computing signal", () => {
		let captured: Signal.Computed<number> | undefined;
		const c = new Signal.Computed(() => ((captured = Signal.subtle.currentComputed()), 1));
		c.get();
		expect(captured).toBe(c);
	});

	it("currentComputed returns undefined outside computation", () => {
		expect(Signal.subtle.currentComputed()).toBe(undefined);
	});

	it("introspectSources returns dependencies", () => {
		const a = new Signal.State(1);
		const b = new Signal.State(2);
		const c = new Signal.Computed(() => a.get() + b.get());
		c.get();
		expect(Signal.subtle.introspectSources(c)).toEqual([a, b]);
	});

	it("hasSources/hasSinks reflect graph connections", () => {
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get());
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		c.get();
		expect(Signal.subtle.hasSources(c)).toBe(true);
		expect(Signal.subtle.hasSinks(s)).toBe(true);
	});

	it("introspectSinks returns watchers of a signal", () => {
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(s);
		expect(Signal.subtle.introspectSinks(s)).toEqual([w]);
	});

	it("exposes descriptive module-local lifecycle symbols", () => {
		expect(typeof Signal.subtle.watched).toBe("symbol");
		expect(typeof Signal.subtle.unwatched).toBe("symbol");
		expect(Signal.subtle.watched.description).toBe("watched");
		expect(Signal.subtle.unwatched.description).toBe("unwatched");
		expect(Symbol.keyFor(Signal.subtle.watched)).toBeUndefined();
		expect(Symbol.keyFor(Signal.subtle.unwatched)).toBeUndefined();
	});

	it("watched callback fires when signal becomes watched", () => {
		let called = false;
		const s = new Signal.State(1, { [Signal.subtle.watched]: () => (called = true) });
		new Signal.subtle.Watcher(() => {}).watch(s);
		expect(called).toBe(true);
	});

	it("unwatched callback fires when signal becomes unwatched", () => {
		let called = false;
		const s = new Signal.State(1, { [Signal.subtle.unwatched]: () => (called = true) });
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(s);
		w.unwatch(s);
		expect(called).toBe(true);
	});
});

describe("Glitch-free execution", () => {
	it("computes once per read, not per change", () => {
		const a = new Signal.State(1);
		const b = new Signal.State(1);
		let runs = 0;
		const sum = new Signal.Computed(() => (runs++, a.get() + b.get()));
		sum.get();
		a.set(2);
		b.set(2);
		sum.get();
		expect(runs).toBe(2);
	});

	it("diamond dependency computes correctly", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get() * 2);
		const c = new Signal.Computed(() => a.get() * 3);
		let runs = 0;
		const d = new Signal.Computed(() => (runs++, b.get() + c.get()));

		expect(d.get()).toBe(5);
		a.set(2);
		expect(d.get()).toBe(10);
		expect(runs).toBe(2);
	});

	it("watch() with no args re-arms notifications", () => {
		let calls = 0;
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get() * 2);
		c.get();
		const w = new Signal.subtle.Watcher(() => calls++);
		w.watch(c);

		s.set(2);
		expect(calls).toBe(1);

		s.set(3); // watcher is pending, no second notify
		expect(calls).toBe(1);

		c.get();
		w.watch(); // re-arm

		s.set(4);
		expect(calls).toBe(2);
	});
});

describe("Edge cases", () => {
	it("throws for non-signal values", () => {
		expect(() => Signal.subtle.hasSinks({} as any)).toThrow("Expected signal");
		expect(() => Signal.subtle.hasSources({} as any)).toThrow("Expected signal");
	});

	it("watch ignores already-watched signals", () => {
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(s);
		w.watch(s);
		expect(Signal.subtle.introspectSources(w)).toEqual([s]);
	});

	it("watch validates all arguments before connecting any", () => {
		const s = new Signal.State(1);
		const w = new Signal.subtle.Watcher(() => {});
		expect(() => w.watch(s, {} as never)).toThrow();
		expect(Signal.subtle.introspectSources(w)).toEqual([]);
		expect(Signal.subtle.introspectSinks(s)).toEqual([]);
	});

	it("unwatch ignores non-watched signals", () => {
		const w = new Signal.subtle.Watcher(() => {});
		w.unwatch(new Signal.State(1)); // should not throw
	});

	it("introspect returns empty for disconnected signals", () => {
		const c = new Signal.Computed(() => 1);
		c.get();
		expect(Signal.subtle.introspectSinks(c)).toEqual([]);
		expect(Signal.subtle.introspectSources(new Signal.subtle.Watcher(() => {}))).toEqual([]);
		expect(Signal.subtle.introspectSinks(new Signal.State(1))).toEqual([]);
	});

	it("sink tracking propagates through computed chain", () => {
		let watched = 0;
		const a = new Signal.State(1, { [Signal.subtle.watched]: () => watched++ });
		const b = new Signal.Computed(() => a.get());
		const c = new Signal.Computed(() => b.get());
		const w = new Signal.subtle.Watcher(() => {});

		w.watch(c);
		c.get();
		expect(watched).toBe(1);
		expect(Signal.subtle.hasSinks(a)).toBe(true);
		expect(Signal.subtle.hasSinks(b)).toBe(true);
	});

	it("removeSink propagates through computed chain", () => {
		let unwatched = 0;
		const a = new Signal.State(1, { [Signal.subtle.unwatched]: () => unwatched++ });
		const b = new Signal.Computed(() => a.get());
		const c = new Signal.Computed(() => b.get());
		const w = new Signal.subtle.Watcher(() => {});

		w.watch(c);
		c.get();
		w.unwatch(c);
		expect(unwatched).toBe(1);
		expect(Signal.subtle.hasSinks(a)).toBe(false);
	});

	it("nested computed updates correctly", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get() * 2);
		const c = new Signal.Computed(() => b.get() + 1);

		expect(c.get()).toBe(3);
		a.set(5);
		expect(c.get()).toBe(11);
	});

	it("recomputation does not duplicate sinks", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get());
		const c = new Signal.Computed(() => b.get());
		const w = new Signal.subtle.Watcher(() => {});

		w.watch(c);
		c.get();
		a.set(2);
		c.get();
		expect(Signal.subtle.introspectSinks(b).length).toBe(1);
	});

	it("stable live dependencies do not churn lifecycle callbacks", () => {
		let watched = 0;
		let unwatched = 0;
		const s = new Signal.State(0, {
			[Signal.subtle.watched]: () => watched++,
			[Signal.subtle.unwatched]: () => unwatched++,
		});
		const c = new Signal.Computed(() => s.get() % 2);
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		c.get();
		s.set(2);
		c.get();

		expect({ watched, unwatched }).toEqual({ watched: 1, unwatched: 0 });
	});

	it("reconciles reordered live dependencies", () => {
		const reverse = new Signal.State(false);
		const a = new Signal.State(1);
		const b = new Signal.State(2);
		const c = new Signal.Computed(() => (reverse.get() ? [b.get(), a.get()] : [a.get(), b.get()]));
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		expect(c.get()).toEqual([1, 2]);
		reverse.set(true);
		expect(c.get()).toEqual([2, 1]);
		expect(Signal.subtle.introspectSources(c)).toEqual([reverse, b, a]);
		expect(Signal.subtle.introspectSinks(a)).toEqual([c]);
		expect(Signal.subtle.introspectSinks(b)).toEqual([c]);
	});

	it("disconnects trailing dependencies after a live branch changes", () => {
		const enabled = new Signal.State(true);
		const source = new Signal.State(1);
		const c = new Signal.Computed(() => (enabled.get() ? source.get() : 0));
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		expect(c.get()).toBe(1);
		enabled.set(false);
		expect(c.get()).toBe(0);
		expect(Signal.subtle.hasSinks(source)).toBe(false);
		expect(Signal.subtle.introspectSources(c)).toEqual([enabled]);
	});

	it("multiple watchers on same signal", () => {
		const s = new Signal.State(1);
		const w1 = new Signal.subtle.Watcher(() => {});
		const w2 = new Signal.subtle.Watcher(() => {});

		w1.watch(s);
		w2.watch(s);
		expect(Signal.subtle.hasSinks(s)).toBe(true);

		w1.unwatch(s);
		expect(Signal.subtle.hasSinks(s)).toBe(true);

		w2.unwatch(s);
		expect(Signal.subtle.hasSinks(s)).toBe(false);
	});

	it("getPending includes never-read computed", () => {
		const s = new Signal.State(1);
		const c = new Signal.Computed(() => s.get());
		const w = new Signal.subtle.Watcher(() => {});
		w.watch(c);
		expect(w.getPending()).toContain(c);
	});

	it("diamond dependency has correct sinks", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get());
		const c = new Signal.Computed(() => a.get());
		const d = new Signal.Computed(() => b.get() + c.get());
		const w = new Signal.subtle.Watcher(() => {});

		w.watch(d);
		d.get();
		expect(Signal.subtle.introspectSinks(a)).toEqual([b, c]);
	});

	it("second watcher does not duplicate source sinks", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get());
		const w1 = new Signal.subtle.Watcher(() => {});
		const w2 = new Signal.subtle.Watcher(() => {});

		w1.watch(b);
		b.get();
		w2.watch(b);
		expect(Signal.subtle.introspectSinks(a).length).toBe(1);

		w1.unwatch(b);
		expect(Signal.subtle.introspectSinks(a).length).toBe(1);

		w2.unwatch(b);
		expect(Signal.subtle.introspectSinks(a).length).toBe(0);

		w1.watch(b);
		expect(Signal.subtle.introspectSinks(a).length).toBe(1);
	});

	it("getPending handles UNSET nested computed", () => {
		const a = new Signal.State(1);
		const b = new Signal.Computed(() => a.get());
		const c = new Signal.Computed(() => b.get() * 2);
		const w = new Signal.subtle.Watcher(() => {});

		w.watch(c);
		a.set(2);
		expect(w.getPending()).toContain(c);
		expect(c.get()).toBe(4);
	});
});

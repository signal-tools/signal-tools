# @signal-tools/signal

A small, performance-optimized, spec-compliant implementation of the
[TC39 Signals proposal](https://github.com/tc39/proposal-signals).

```shell
npm install @signal-tools/signal
```

## Features

- Spec-compliant reactive primitives: `State`, `Computed`, and `Watcher`
- Glitch-free execution with topological ordering
- Type guards: `Signal.isState()` and `Signal.isComputed()`
- Zero dependencies; ~3.1KB minified, ~1.3KB gzipped
- Tested across Node.js, Chromium, Firefox, and WebKit

## Usage

```js
import { Signal } from "@signal-tools/signal";

// Create a state signal
const count = new Signal.State(0);

// Create a computed signal
const doubled = new Signal.Computed(() => count.get() * 2);

// Read values
console.log(count.get()); // 0
console.log(doubled.get()); // 0

// Update state
count.set(5);
console.log(doubled.get()); // 10

// Watch for changes
const watcher = new Signal.subtle.Watcher(() => {
	console.log("Signal changed!");
});
watcher.watch(doubled);

count.set(10); // logs: "Signal changed!"

watcher.unwatch(doubled);
```

## API

### `Signal.State<T>`

A writable signal holding a value.

- `new Signal.State(value, options?)` — create with initial value
- `.get()` — read current value
- `.set(value)` — update value

### `Signal.Computed<T>`

A derived signal that recomputes when dependencies change.

- `new Signal.Computed(fn, options?)` — create with computation function
- `.get()` — read computed value (lazy evaluation)

### `Signal.subtle.Watcher`

Low-level primitive for effect scheduling.

- `new Signal.subtle.Watcher(notify)` — create with notification callback
- `.watch(...signals)` — start watching signals
- `.unwatch(...signals)` — stop watching signals
- `.getPending()` — get signals needing recomputation

### Type Guards

- `Signal.isState(value)` — returns `true` if value is a `State` signal
- `Signal.isComputed(value)` — returns `true` if value is a `Computed` signal

### `Signal.subtle` Utilities

- `untrack(fn)` — run function without tracking dependencies
- `currentComputed()` — get currently computing signal
- `introspectSources(signal)` — get signal's dependencies
- `introspectSinks(signal)` — get signal's dependents
- `hasSources(signal)` — check if signal has dependencies
- `hasSinks(signal)` — check if signal has dependents
- `watched` / `unwatched` — symbols for lifecycle callbacks

## Options

Both `State` and `Computed` accept an options object:

```js
const state = new Signal.State(0, {
	equals: (a, b) => a === b, // custom equality (default: Object.is)
	[Signal.subtle.watched]() {
		console.log("now watched");
	},
	[Signal.subtle.unwatched]() {
		console.log("no longer watched");
	},
});
```

## License

[MIT-0](LICENSE.md) — No attribution required.

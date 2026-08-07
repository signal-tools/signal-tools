# @signal-tools/collections

Signal-aware native collections built on [`@signal-tools/signal`](../signal).

## Install

```shell
npm install @signal-tools/signal @signal-tools/collections
```

To use `signal-polyfill` as the signal implementation, install it under the peer dependency name using an npm alias:

```shell
npm install @signal-tools/signal@npm:signal-polyfill @signal-tools/collections
```

Continue importing `Signal` from `@signal-tools/signal`; npm resolves that specifier to `signal-polyfill`.

## Usage

```js
import { Signal } from "@signal-tools/signal";
import { SignalArray, SignalMap, SignalObject, SignalSet } from "@signal-tools/collections";

const items = new SignalArray([1, 2]);
const total = new Signal.Computed(() => items.reduce((sum, item) => sum + item, 0));

items.push(3);
console.log(total.get()); // 6
```

## Exports

- `SignalArray` tracks direct index and length reads independently from whole-collection reads.
- `SignalMap` tracks key presence, key values, structure, and content iteration separately.
- `SignalSet` tracks membership and collection reads.
- `SignalObject` creates a shallow signal-backed plain record and includes `SignalObject.fromEntries()`.

All constructors preserve native Array, Map, Set, or Object behavior. Unchanged writes do not invalidate tracked
computations. The package uses the consumer's peer-installed `@signal-tools/signal` instance.

## License

[MIT-0](LICENSE.md) — No attribution required.

# @signal-tools/effect

Microtask-batched effects for TC39 Signals, built on
[`@signal-tools/signal`](../signal).

```shell
npm install @signal-tools/signal @signal-tools/effect
```

Effect declares `@signal-tools/signal` as a peer dependency. Libraries can depend on Effect and declare Signal as their
own peer so the complete application uses one Signal installation.

```js
import { effect } from "@signal-tools/effect";
import { Signal } from "@signal-tools/signal";

const value = new Signal.State("initial");
const dispose = effect(() => {
	console.log(value.get());
});

value.set("updated");
dispose();
```

Effects run synchronously once, then batch subsequent invalidations onto the next microtask. `createEffect` provides a
dormant controller for consumers that must register disposal before the initial run.

## License

[MIT-0](LICENSE.md) — No attribution required.

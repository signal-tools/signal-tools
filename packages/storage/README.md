# @signal-tools/storage

**`@signal-tools/storage`** adds signal-backed watches to the typed, observable Web Storage client from
`@serve-tools/client-storage`.

```shell
npm install @signal-tools/storage @signal-tools/signal
```

## Typed storage

Describe the keys and their string values once. The schema exists only in TypeScript and adds nothing at runtime.

```ts
import { Storage } from "@signal-tools/storage";

interface AppStorage {
	theme: "dark" | "light";
	token: string;
}

const storage = new Storage<AppStorage>();

storage.set("theme", "dark");
storage.get("theme"); // "dark" | "light" | null
storage.has("theme"); // true
storage.delete("theme"); // true
```

Pass `session` to use `sessionStorage` instead.

```ts
const session = new Storage<AppStorage>("session", window);
```

## Change subscriptions

`subscribe` synchronously delivers every change occurrence for one key. It receives writes made through the wrapper in
the current document and native `storage` events from other documents using the same storage area.

```ts
const unsubscribe = storage.subscribe("theme", (change) => {
	switch (change.kind) {
		case "added":
		case "updated":
			console.log(change.value);
	}
});

storage.set("theme", "light");

unsubscribe();
```

Changes are discriminated as `added`, `updated`, `removed`, or `invalidated`. An invalidation means the current value
should be read again. Unchanged writes do not notify subscribers. Subscriptions are removed explicitly with the returned
function or automatically with an `AbortSignal`.

Each occurrence uses a registration-order snapshot. A subscriber added during delivery waits until the next occurrence;
a subscriber removed before its turn is skipped. If callbacks fail, every later active subscriber still runs. After
delivery, one error is rethrown unchanged, while multiple errors are reported in delivery order in an `AggregateError`.
Writes made through `set` or `delete` are committed before callback errors surface.

```ts
const controller = new AbortController();

storage.subscribe("token", updateAuthentication, { signal: controller.signal });
controller.abort();
```

The package listens for the global `storage` event only while at least one subscription or watch is active and filters
events by storage area. Native clear events do not identify individual keys, so they invalidate every actively observed
key.

## Reactive watches

`watch` returns a read-only computed signal containing the current value. Known changes apply their exact deltas without
rereading storage. Invalidations and explicit `refresh()` calls reread storage synchronously. Signal consumers may
coalesce intermediate changes and observe only the latest value; use `subscribe` when every occurrence matters.

```ts
const theme = storage.watch("theme");

theme.get(); // "dark" | "light" | null
storage.set("theme", "light");
theme.get(); // "light"

storage.source.setItem("theme", "dark");
theme.get(); // still "light"
theme.refresh();
theme.get(); // "dark"

theme.dispose();
```

Direct same-document writes through `source` do not emit a `storage` event in that document, so call `refresh()` to make
them visible to an active watch. Call `dispose()` or `Symbol.dispose` to stop following storage changes. Disposal is
idempotent; a disposed signal retains its last observed value, and later refreshes are no-ops.

## Migration and API notes

- `StorageSignal` now includes `refresh(): void` for synchronous rereads.
- Same-document writes made directly through `storage.source` require `refresh()` to update an active watch.
- Subscriber failures no longer stop occurrence delivery. Later active subscribers run before the original error or an
  ordered `AggregateError` is thrown.

## License

[MIT-0](LICENSE.md) — No attribution required.

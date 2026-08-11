/// <reference lib="dom" />

import { Signal } from "@signal-tools/signal";
import { expect, test } from "vitest";

import { DB } from "../src/db.js";
import type { BrowserTestSchema, User } from "./db.worker.js";

const connect = (name: string) => {
	const worker = new SharedWorker(new URL("./db.worker.ts", import.meta.url), { name, type: "module" });
	const database = DB.connect<BrowserTestSchema>(worker.port);

	return {
		database,
		close(): void {
			database.close();
			worker.port.close();
		},
	};
};

const ready = <Value>(value: Value) => ({ status: "ready", value });

test("coordinates real shared database operations with reactive signals", async () => {
	const sharedName = crypto.randomUUID();
	const connections = [connect(sharedName), connect(sharedName)];
	const [first, second] = connections;
	const selectedKey = new Signal.State("ada");
	const count = new Signal.State(1);
	const selected = second.database.watch("users", selectedKey);
	const users = first.database.watchAll("users", { count });
	const ada: User = { id: "ada", name: "Ada" };
	const margaret: User = { id: "margaret", name: "Margaret" };

	try {
		expect(selected.get()).toEqual({ status: "pending" });
		expect(users.get()).toEqual({ status: "pending" });
		await expect.poll(() => [selected.get(), users.get()]).toEqual([ready(undefined), ready([])]);

		expect(await first.database.add("users", ada)).toBe(ada.id);
		await expect.poll(() => [selected.get(), users.get()]).toEqual([ready(ada), ready([ada])]);
		expect(await second.database.get("users", ada.id)).toEqual(ada);
		expect(await second.database.has("users", ada.id)).toBe(true);

		await expect(second.database.add("users", ada)).rejects.toMatchObject({ name: "ConstraintError" });

		const updatedAda = { ...ada, name: "Augusta" };

		expect(await second.database.put("users", updatedAda)).toBe(ada.id);
		await expect.poll(() => [selected.get(), users.get()]).toEqual([ready(updatedAda), ready([updatedAda])]);

		await first.database.add("users", margaret);
		expect(await second.database.getAllKeys("users")).toEqual([ada.id, margaret.id]);
		expect(await second.database.count("users")).toBe(2);
		count.set(2);
		await expect.poll(() => users.get()).toEqual(ready([updatedAda, margaret]));

		selectedKey.set(margaret.id);
		await expect.poll(() => selected.get()).toEqual(ready(margaret));
		await first.database.delete("users", margaret.id);
		await expect.poll(() => [selected.get(), users.get()]).toEqual([ready(undefined), ready([updatedAda])]);

		expect(await first.database.add("logs", "opened")).toBe(1);
		expect(await second.database.count("logs")).toBe(1);

		const cancelled = new AbortController();

		cancelled.abort();
		await expect(second.database.get("users", ada.id, { signal: cancelled.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(Signal.subtle.hasSinks(selectedKey)).toBe(true);
		selected.dispose();
		expect(Signal.subtle.hasSinks(selectedKey)).toBe(false);
		await first.database.clear("users");
		await expect.poll(() => users.get()).toEqual(ready([]));

		expect(Signal.subtle.hasSinks(count)).toBe(true);
		first.database.close();
		expect(Signal.subtle.hasSinks(count)).toBe(false);
	} finally {
		selected.dispose();
		users.dispose();

		for (const connection of connections) connection.close();
	}
});

/// <reference lib="webworker" />

import type { DB } from "../src/db.js";
import { activate } from "../src/shared-worker.js";

export interface User {
	id: string;
	name: string;
}

export interface BrowserTestSchema {
	users: DB.Store<User, string>;
	logs: DB.Store<string, number>;
}

const scope = globalThis as unknown as SharedWorkerGlobalScope;

activate<BrowserTestSchema>(`signal-tools-db-${scope.name}`, {
	version: 1,
	upgrade(database) {
		database.createObjectStore("users", { keyPath: "id" });
		database.createObjectStore("logs", { autoIncrement: true });
	},
});

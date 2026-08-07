import { cp, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const effectDist = dirname(fileURLToPath(import.meta.resolve("@signal-tools/effect")));
const signal = fileURLToPath(import.meta.resolve("@signal-tools/signal"));

await rm("dist", { force: true, recursive: true });
await cp("src", "dist", { recursive: true });
await cp("../../packages/dom/dist", "dist/dom", { recursive: true });
await cp(effectDist, "dist/effect", { recursive: true });
await cp(signal, "dist/signal.js");

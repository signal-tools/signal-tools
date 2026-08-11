import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = "https://github.com/serve-tools/web-tools.git";
const defaultPackages = ["@serve-tools/client-shared-db", "@serve-tools/client-storage"];
const [ref = "main"] = process.argv.slice(2);
const packageNames = (process.env.WEB_TOOLS_PACKAGES ?? defaultPackages.join(" ")).trim().split(/\s+/u);
const checkout = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "signal-tools-web-tools-"));
const run = (command, args, cwd = process.cwd(), capture = false) =>
	execFileSync(command, args, { cwd, encoding: capture ? "utf8" : undefined, stdio: capture ? "pipe" : "inherit" });

run("git", ["init", "--quiet", checkout]);
run("git", ["-C", checkout, "remote", "add", "origin", repository]);
run("git", ["-C", checkout, "fetch", "--quiet", "--depth=1", "origin", ref]);
run("git", ["-C", checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);

const sha = run("git", ["rev-parse", "HEAD"], checkout, true).trim();

run("npm", ["ci", "--ignore-scripts"], checkout);
run("npm", ["run", "build"], checkout);

const workspaces = JSON.parse(run("npm", ["query", ".workspace"], checkout, true));
const pathsByName = new Map(workspaces.map(({ name, path }) => [name, path]));
const packagePaths = packageNames.map((name) => {
	const path = pathsByName.get(name);

	if (path === undefined) throw new Error(`${name} does not exist in web-tools@${ref}`);

	return path;
});

run("npm", ["link", "--no-save", "--no-package-lock", "--ignore-scripts", ...packagePaths]);

for (const [index, name] of packageNames.entries()) {
	const linkedPath = resolve("node_modules", ...name.split("/"));

	if (realpathSync(linkedPath) !== realpathSync(packagePaths[index])) throw new Error(`${name} was not linked`);
}

const summary = `Linked ${packageNames.join(", ")} from serve-tools/web-tools@${sha}\n`;

console.log(summary.trim());
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

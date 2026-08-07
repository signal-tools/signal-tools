import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [packageArgument] = process.argv.slice(2);

if (packageArgument === undefined) {
	throw new Error("Expected a package name");
}

const metadata = JSON.parse(readFileSync(`packages/${packageArgument}/package.json`, "utf8"));
const dependencies = { ...metadata.dependencies, ...metadata.peerDependencies };

for (const [name, range] of Object.entries(dependencies)) {
	if (name.startsWith("@signal-tools/")) {
		execFileSync("npm", ["view", `${name}@${range}`, "version"], { stdio: "inherit" });
	}
}

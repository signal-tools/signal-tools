import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [directoryArgument, packageArgument, versionArgument] = process.argv.slice(2);

if (directoryArgument === undefined || packageArgument === undefined || versionArgument === undefined) {
	throw new Error("Expected a candidate directory, package name, and version");
}

const directory = resolve(directoryArgument);
const tarballs = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
const expectedTarball = `signal-tools-${packageArgument}-${versionArgument}.tgz`;

if (tarballs.length !== 1 || tarballs[0] !== expectedTarball) {
	throw new Error(`Expected only ${expectedTarball}`);
}

const tarball = join(directory, expectedTarball);
const [expectedChecksum, checksumTarball] = readFileSync(join(directory, "SHA256SUMS"), "utf8").trim().split(/\s+/u);
const actualChecksum = createHash("sha256").update(readFileSync(tarball)).digest("hex");

if (expectedChecksum !== actualChecksum || checksumTarball !== expectedTarball) {
	throw new Error("Candidate checksum does not match the tarball");
}

const metadata = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
const expectedName = `@signal-tools/${packageArgument}`;

if (metadata.name !== expectedName || metadata.version !== versionArgument) {
	throw new Error("Candidate package name or version does not match");
}

if (
	manifest.package !== expectedName ||
	manifest.version !== versionArgument ||
	manifest.tarball !== basename(tarball)
) {
	throw new Error("Candidate manifest does not match the tarball");
}

if (process.env.CANDIDATE_SHA !== undefined && manifest.sha !== process.env.CANDIDATE_SHA) {
	throw new Error("Candidate manifest SHA does not match its workflow run");
}

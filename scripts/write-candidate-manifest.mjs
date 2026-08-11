import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const [tarballArgument, packageArgument] = process.argv.slice(2);

if (tarballArgument === undefined || packageArgument === undefined) {
	throw new Error("Expected a candidate tarball and package name");
}

const tarball = resolve(tarballArgument);
const metadata = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
const expectedName = `@signal-tools/${packageArgument}`;

if (metadata.name !== expectedName) {
	throw new Error(`Expected ${expectedName}, received ${metadata.name}`);
}

writeFileSync(
	join(dirname(tarball), "manifest.json"),
	JSON.stringify(
		{
			package: metadata.name,
			version: metadata.version,
			sha: process.env.GITHUB_SHA,
			tarball: basename(tarball),
		},
		null,
		2,
	) + "\n",
);

const checksum = createHash("sha256").update(readFileSync(tarball)).digest("hex");

writeFileSync(join(dirname(tarball), "SHA256SUMS"), `${checksum}  ${basename(tarball)}\n`);

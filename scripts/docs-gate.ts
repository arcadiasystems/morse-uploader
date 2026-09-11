/**
 * Fail when the README or CHANGELOG has fallen behind `package.json`.
 *
 * Mirrors the gates in morse-sdk and morse-cli. Both of those drifted more
 * than once in ways nothing else could catch: a version claim in prose is
 * invisible to lint, typecheck and tests.
 *
 * Deliberately narrow: only facts that must change when the version does,
 * plus the peer range, which is the one thing a consumer of a library built
 * on another library most needs to be right.
 */

import pkg from "../package.json" with { type: "json" };

const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();
const changelog = await Bun.file(
	new URL("../CHANGELOG.md", import.meta.url),
).text();

const failures: string[] = [];

const newest = /^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/m.exec(changelog)?.[1];
if (newest !== pkg.version) {
	failures.push(
		`CHANGELOG's newest entry is ${newest ?? "(none)"}, but package.json is ${pkg.version}. Every release needs an entry.`,
	);
}

// The README states which morse-sdk this is built on; it drifted four minors
// behind the peer range before anyone noticed.
const peer = pkg.peerDependencies["@arcadiasystems/morse-sdk"];
const peerMinor = /([0-9]+\.[0-9]+)/.exec(peer)?.[1];
if (
	peerMinor !== undefined &&
	!readme.includes(
		`morse-sdk\`](https://github.com/arcadiasystems/morse-dcms) ${peerMinor}`,
	)
) {
	failures.push(
		`README does not say it is built on morse-sdk ${peerMinor}, which is what peerDependencies requires (${peer}).`,
	);
}

if (failures.length > 0) {
	console.error(`Docs gate failed for ${pkg.name}@${pkg.version}:`);
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
console.log(`Docs gate passed (${pkg.name}@${pkg.version}).`);

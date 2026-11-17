/**
 * Print one version's section of CHANGELOG.md, without its heading.
 *
 * The release workflow uses the output as the GitHub Release notes, and runs
 * it once before publishing so a release with no entry stops early. Exits 1
 * when the version has no section or the section is empty.
 *
 * Usage: bun scripts/changelog-section.ts 0.5.0
 */

const version = process.argv[2];
if (version === undefined || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
	console.error("Usage: bun scripts/changelog-section.ts <major.minor.patch>");
	process.exit(1);
}

const changelog = await Bun.file(
	new URL("../CHANGELOG.md", import.meta.url),
).text();
const lines = changelog.split("\n");

const heading = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (heading === -1) {
	console.error(`CHANGELOG.md has no "## [${version}]" section.`);
	process.exit(1);
}

const following = lines.findIndex(
	(line, index) => index > heading && line.startsWith("## ["),
);
const section = lines
	.slice(heading + 1, following === -1 ? lines.length : following)
	.join("\n")
	.trim();
if (section === "") {
	console.error(`The "## [${version}]" section of CHANGELOG.md is empty.`);
	process.exit(1);
}

console.log(section);

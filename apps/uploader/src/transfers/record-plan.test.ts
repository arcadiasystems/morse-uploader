import { describe, expect, it } from "vitest";
import { rootsFromPicked } from "@/local/local-library";
import type { PublishChoice } from "@/upload/publish-rules";
import { buildUploadPlan, type SealSettings } from "@/upload/upload-plan";
import { recordPlanFor, recordTransactions } from "./record-plan";

const SEAL: SealSettings = {
	envelope: { keyServers: 2, identityBytes: 49 },
	policyPackageId:
		"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0",
};
const NOTES: PublishChoice = {
	publicationId:
		"0x8a0d07b8d2ef1efeefdfb9701ad1b4896d31c43ad94498b70a327f017e6aaf69",
	publicationName: "Claude Testnet Run",
	publisherCapId:
		"0x5f774e7a754a7a8f17f952baa7903afa0db85bfaf1e9dae9ea2d92f2c0e8a3e3",
	collectionName: "notes",
	storageMode: "blob",
};

function planOf(
	paths: readonly string[],
	seal: SealSettings | null,
	mode: "quilt" | "per-file" = "quilt",
) {
	let next = 0;
	const library = rootsFromPicked(
		paths.map((path) => ({
			path,
			file: new File(["x"], path.split("/").at(-1) ?? path, {
				type: "text/plain",
			}),
		})),
		() => `root-${next++}`,
	);
	const selected = new Set(
		library.flatMap((root) => root.files.map((file) => file.id)),
	);
	return buildUploadPlan({ library, selected, mode, seal, nShards: 1000 });
}

describe("recordPlanFor", () => {
	it("plans nothing for a public upload that is not published", () => {
		const [blob] = planOf(["a.txt"], null).items;
		if (!blob) throw new Error("no item");
		const plan = recordPlanFor(blob, null);
		expect(plan).toEqual({ publish: null, recipientFile: null });
		expect(recordTransactions(plan)).toBe(0);
	});

	it("plans a RecipientFile for an encrypted file before it is encrypted", () => {
		const [blob] = planOf(["secret.txt"], SEAL).items;
		if (!blob) throw new Error("no item");
		const plan = recordPlanFor(blob, null);
		expect(plan.recipientFile).toEqual({
			name: "secret.txt",
			contentType: "text/plain",
			size: 1,
			sealIdPrefixHex: null,
		});
		expect(recordTransactions(plan)).toBe(1);
	});

	it("names a RecipientFile after the file, not its path, to stay under 256 bytes", () => {
		const [blob] = planOf(["photos/2026/october/secret.txt"], SEAL).items;
		if (!blob) throw new Error("no item");
		expect(recordPlanFor(blob, null).recipientFile?.name).toBe("secret.txt");
	});

	it("plans one entry per blob when published", () => {
		const [blob] = planOf(["note.md"], null).items;
		if (!blob) throw new Error("no item");
		const plan = recordPlanFor(blob, NOTES);
		expect(plan.publish?.entries).toEqual([
			{ name: "note.md", contentType: "text/plain", patch: null },
		]);
		expect(recordTransactions(plan)).toBe(1);
	});

	it("plans one entry per quilt file, by identifier", () => {
		const [quilt] = planOf(["site/index.html", "site/a/b.txt"], null).items;
		if (!quilt) throw new Error("no item");
		const plan = recordPlanFor(quilt, { ...NOTES, storageMode: "quilt" });
		expect(plan.publish?.entries.map((entry) => entry.name)).toEqual([
			"a/b.txt",
			"index.html",
		]);
		expect(recordTransactions(plan)).toBe(2);
	});
});

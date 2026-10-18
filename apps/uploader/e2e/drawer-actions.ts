import { deflateSync } from "node:zlib";
import type { Keypair } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WalrusClient, walrus } from "@mysten/walrus";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { ChainBlob } from "./chain";

/** Drawer helpers for the phase 4 Testnet spec. */

export const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const FULLNODE = "https://fullnode.testnet.sui.io:443";
const RELAY = "https://upload-relay.testnet.walrus.space";

/** A Sui and Walrus client in the test process: a reader independent of the page. */
export function nodeClient() {
	return new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE }).$extend(
		walrus(),
	);
}

export function drawer(page: Page): Locator {
	return page.locator("aside.drawer");
}

/**
 * Opens the drawer on a blob (or one file of a quilt) by searching its
 * object id and activating its row in Files. The drawer takes a column
 * beside the list, so it never covers the row.
 */
export async function openDrawer(
	page: Page,
	objectId: string,
	patchIdentifier?: string,
): Promise<Locator> {
	// Confirming an upload opens the transfers slide-over, which covers the
	// details column; close it first, as a person would.
	const transfers = page.getByRole("dialog", { name: "Transfers" });
	if (await transfers.isVisible())
		await transfers.getByRole("button", { name: "Close transfers" }).click();
	const panel = drawer(page);
	if (await panel.isVisible())
		await panel.getByRole("button", { name: "Close details" }).click();
	await page.getByRole("searchbox", { name: /Search blobs/ }).fill(objectId);
	const row = page.locator(`table.tbl tr[data-key="${objectId}"]`);
	await row.locator("td.nm").click();
	if (patchIdentifier !== undefined) {
		await page.keyboard.press("ArrowRight");
		const patch = page
			.locator('table.tbl tbody tr[aria-level="2"]')
			.filter({ has: page.locator("td.nm", { hasText: patchIdentifier }) })
			.first();
		await patch.locator("td.nm").click({ timeout: 90_000 });
	}
	await expect(panel).toBeVisible();
	return panel;
}

/**
 * Records the digest of the transaction a drawer note links to, for the PR.
 */
export async function annotateTransaction(
	note: Locator,
	what: string,
): Promise<string> {
	const href = await note
		.getByRole("link", { name: "View transaction" })
		.getAttribute("href");
	const digest = href?.split("/").at(-1) ?? "";
	test.info().annotations.push({
		type: "fixture",
		description: `${what}: tx ${digest}`,
	});
	return digest;
}

/** Live blobs the wallet owns, from chain. */
export function liveCertified(
	blobs: readonly ChainBlob[],
	epoch: number,
): ChainBlob[] {
	return blobs.filter(
		(blob) => blob.certifiedEpoch !== null && blob.endEpoch > epoch,
	);
}

export function isPlain(blob: ChainBlob): boolean {
	return !blob.attributes._walrusBlobType && !blob.attributes.seal;
}

/** `units × price × epochs`: the WAL an extend pays (PROTOCOL-NOTES section 8), computed here on its own. */
export function extendCost(
	encodedSize: bigint,
	epochs: number,
	price: bigint,
): bigint {
	const units = (encodedSize + 1_048_575n) / 1_048_576n;
	return units * price * BigInt(epochs);
}

/** A raw amount as the app's cap field takes it: a plain decimal of WAL. */
export function toDecimal(raw: bigint): string {
	const whole = raw / 1_000_000_000n;
	const fraction = (raw % 1_000_000_000n)
		.toString()
		.padStart(9, "0")
		.replace(/0+$/, "");
	return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** A tiny valid RGB PNG, one pixel per byte triple of `seed`, so every run is new bytes. */
export function tinyPng(seed: string): Buffer {
	const pixels = Buffer.from(seed.padEnd(12, ".").slice(0, 12));
	const width = 4;
	const raw = Buffer.concat([Buffer.from([0]), pixels]);
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(1, 4);
	header.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1)
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Registers a blob from the test process with the test key, for one epoch,
 * and optionally uploads it through the relay, but never certifies it: the
 * Registered state the drawer's Finish is for.
 * @returns The new Blob object id.
 */
export async function registerWithoutCertify({
	keypair,
	bytes,
	name,
	upload,
}: {
	keypair: Keypair;
	bytes: Uint8Array;
	name: string;
	upload: boolean;
}): Promise<string> {
	const suiClient = new SuiGrpcClient({
		network: "testnet",
		baseUrl: FULLNODE,
	});
	const writer = new WalrusClient({
		network: "testnet",
		suiClient,
		uploadRelay: { host: RELAY, sendTip: { max: 10_000 }, timeout: 120_000 },
	});
	const flow = writer.writeBlobFlow({ blob: bytes });
	await flow.encode();
	const owner = keypair.toSuiAddress();
	const register = flow.register({
		epochs: 1,
		deletable: true,
		owner,
		attributes: { name, "content-type": "text/plain" },
	});
	const result = await suiClient.signAndExecuteTransaction({
		transaction: register,
		signer: keypair,
	});
	const digest =
		result.$kind === "Transaction"
			? result.Transaction.digest
			: result.FailedTransaction.digest;
	if (result.$kind !== "Transaction")
		throw new Error(`The register transaction ${digest} failed.`);
	await suiClient.core.waitForTransaction({ digest });
	if (upload) {
		const uploaded = await flow.upload({ digest });
		return uploaded.blobObjectId;
	}
	const blobType = await writer.getBlobType();
	const executed = await suiClient.core.waitForTransaction({
		digest,
		include: { effects: true, objectTypes: true },
	});
	if (executed.$kind !== "Transaction")
		throw new Error(`The register transaction ${digest} failed.`);
	const created = executed.Transaction.effects.changedObjects.find(
		(change) =>
			change.idOperation === "Created" &&
			executed.Transaction.objectTypes[change.objectId] === blobType,
	);
	if (!created) throw new Error(`Register ${digest} created no Blob.`);
	return created.objectId;
}

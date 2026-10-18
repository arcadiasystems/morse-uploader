import { describe, expect, it } from "vitest";
import {
	type ActivityTypes,
	classifyTransaction,
	parseTransactionsPage,
	type SentTransaction,
} from "./activity";

const WALRUS =
	"0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66";
const MORSE =
	"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0";
const RECIPIENT_ORIGIN =
	"0x3bb8773c55b5bfde6c3821da52afd038a52e6a6ac586d5106013144f3aa7747f";

const TYPES: ActivityTypes = {
	blob: `${WALRUS}::blob::Blob`,
	publication: `${MORSE}::publication::Publication`,
	recipientFile: `${RECIPIENT_ORIGIN}::recipient_file::RecipientFile`,
};

const BLOB_ID = `0x5d9412aaa64c40b469c5231306bc1f474cf6d8acf625cff85629b5784584217f`;
const PUBLICATION_ID =
	"0x8a0d07b8d2ef1efeefdfb9701ad1b4896d31c43ad94498b70a327f017e6aaf69";
const FILE_ID =
	"0x480d599a3e19ed90670084d55c22886598bc0e388ae564371a44ca99d843098e";
const SYSTEM_ID =
	"0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af";

function transaction(overrides: Partial<SentTransaction>): SentTransaction {
	return {
		digest: "4JKBDNaUK4xp7kbhqnSzPKQwBUsAgKrtQTvrbF6sbYpq",
		timestampMs: Date.parse("2026-10-18T13:29:50.272Z"),
		succeeded: true,
		calls: [],
		changed: [],
		events: [],
		...overrides,
	};
}

const blobChange = { objectId: BLOB_ID, type: TYPES.blob };
const systemChange = {
	objectId: SYSTEM_ID,
	type: `${WALRUS}::system::System`,
};

describe("parseTransactionsPage", () => {
	// Two of the test wallet's transactions as Sui GraphQL returned them on
	// 2026-10-18, oldest first as `last:` pages come, trimmed.
	const data = {
		transactions: {
			nodes: [
				{
					digest: "4JKBDNaUK4xp7kbhqnSzPKQwBUsAgKrtQTvrbF6sbYpq",
					effects: {
						status: "SUCCESS",
						timestamp: "2026-10-18T13:29:50.272Z",
						objectChanges: {
							nodes: [
								{
									address: BLOB_ID,
									inputState: {
										asMoveObject: { contents: { type: { repr: TYPES.blob } } },
									},
									outputState: {
										asMoveObject: { contents: { type: { repr: TYPES.blob } } },
									},
								},
								// A package or other non-Move object has no Move type.
								{ address: SYSTEM_ID, inputState: null, outputState: null },
							],
						},
						events: { nodes: [] },
					},
					kind: {
						commands: {
							nodes: [
								{
									function: {
										name: "extend_blob",
										module: { name: "system" },
									},
								},
								{
									function: {
										name: "destroy_zero",
										module: { name: "coin" },
									},
								},
								// SplitCoins and other commands carry no function.
								{},
							],
						},
					},
				},
				{
					digest: "4ifWGA6wWkWm1TmcjCns7vTGiiBihkmikfPwpFsMujRH",
					effects: {
						status: "FAILURE",
						timestamp: "2026-10-18T13:30:28.754Z",
						objectChanges: {
							nodes: [
								{
									address: FILE_ID,
									outputState: {
										asMoveObject: {
											contents: { type: { repr: TYPES.recipientFile } },
										},
									},
								},
							],
						},
						events: {
							nodes: [
								{
									contents: {
										type: {
											repr: `${RECIPIENT_ORIGIN}::recipient_file::RecipientAdded`,
										},
										json: { file: FILE_ID, recipient: "0xffa0" },
									},
								},
								{ contents: { json: "not an object" } },
							],
						},
					},
					kind: {
						commands: {
							nodes: [
								{
									function: {
										name: "add_recipient",
										module: { name: "recipient_file" },
									},
								},
							],
						},
					},
				},
				// No timestamp: not a transaction the feed can place.
				{ digest: "broken", effects: {} },
			],
		},
	};

	it("reads sent transactions newest first, skipping malformed ones", () => {
		const parsed = parseTransactionsPage(data);
		expect(parsed.map((sent) => sent.digest)).toEqual([
			"4ifWGA6wWkWm1TmcjCns7vTGiiBihkmikfPwpFsMujRH",
			"4JKBDNaUK4xp7kbhqnSzPKQwBUsAgKrtQTvrbF6sbYpq",
		]);
		const [added, extended] = parsed;
		expect(extended).toEqual({
			digest: "4JKBDNaUK4xp7kbhqnSzPKQwBUsAgKrtQTvrbF6sbYpq",
			timestampMs: Date.parse("2026-10-18T13:29:50.272Z"),
			succeeded: true,
			calls: [
				{ module: "system", fn: "extend_blob" },
				{ module: "coin", fn: "destroy_zero" },
			],
			changed: [
				{ objectId: BLOB_ID, type: TYPES.blob },
				{ objectId: SYSTEM_ID, type: null },
			],
			events: [],
		});
		expect(added?.succeeded).toBe(false);
		expect(added?.events).toEqual([
			{
				type: `${RECIPIENT_ORIGIN}::recipient_file::RecipientAdded`,
				json: { file: FILE_ID, recipient: "0xffa0" },
			},
		]);
	});

	it("rejects a body without a transactions page", () => {
		expect(() => parseTransactionsPage({})).toThrow(/no transactions page/);
		expect(() => parseTransactionsPage(null)).toThrow(/no transactions page/);
	});
});

describe("classifyTransaction", () => {
	it("recognises Walrus register, certify, extend and delete by call and Blob type", () => {
		const kind = (fn: string) =>
			classifyTransaction(
				transaction({
					calls: [
						{ module: "system", fn: "reserve_space" },
						{ module: "system", fn },
					],
					changed: [systemChange, blobChange],
				}),
				TYPES,
			)?.kind;
		expect(kind("register_blob")).toBe("register");
		expect(kind("certify_blob")).toBe("certify");
		expect(kind("extend_blob")).toBe("extend");
		expect(kind("delete_blob")).toBe("delete");
	});

	it("names the Blob objects a Walrus action changed", () => {
		const item = classifyTransaction(
			transaction({
				calls: [{ module: "system", fn: "certify_blob" }],
				changed: [blobChange, systemChange],
			}),
			TYPES,
		);
		expect(item).toEqual({
			digest: "4JKBDNaUK4xp7kbhqnSzPKQwBUsAgKrtQTvrbF6sbYpq",
			timestampMs: Date.parse("2026-10-18T13:29:50.272Z"),
			succeeded: true,
			kind: "certify",
			blobObjectIds: [BLOB_ID],
			publicationIds: [],
			file: null,
			recipient: null,
		});
	});

	it("matches types whatever the package address spelling", () => {
		const item = classifyTransaction(
			transaction({
				calls: [{ module: "system", fn: "extend_blob" }],
				changed: [{ objectId: BLOB_ID, type: TYPES.blob }],
			}),
			{
				...TYPES,
				blob: `${WALRUS.toUpperCase().replace("0X", "0x")}::blob::Blob`,
			},
		);
		expect(item?.kind).toBe("extend");
	});

	it("recognises a Morse entry added to a publication", () => {
		const item = classifyTransaction(
			transaction({
				calls: [{ module: "publication", fn: "add_entry_to_collection" }],
				changed: [
					blobChange,
					{ objectId: PUBLICATION_ID, type: TYPES.publication },
				],
			}),
			TYPES,
		);
		expect(item).toMatchObject({
			kind: "publish",
			blobObjectIds: [BLOB_ID],
			publicationIds: [PUBLICATION_ID],
		});
	});

	it("names the RecipientFile an encrypted upload created, from its event", () => {
		const item = classifyTransaction(
			transaction({
				calls: [
					{
						module: "recipient_file",
						fn: "new_recipient_file_with_seal_prefix",
					},
					{ module: "recipient_file", fn: "share_recipient_file" },
				],
				changed: [{ objectId: FILE_ID, type: TYPES.recipientFile }],
				events: [
					{
						type: `${RECIPIENT_ORIGIN}::recipient_file::RecipientFileCreated`,
						json: {
							file: FILE_ID,
							owner:
								"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
							name: "sealed-note.txt",
							members: [],
						},
					},
				],
			}),
			TYPES,
		);
		expect(item).toMatchObject({
			kind: "encrypt",
			file: { id: FILE_ID, name: "sealed-note.txt" },
			recipient: null,
		});
	});

	it("reads the recipient a share added, in full form", () => {
		const item = classifyTransaction(
			transaction({
				calls: [{ module: "recipient_file", fn: "add_recipient" }],
				changed: [{ objectId: FILE_ID, type: TYPES.recipientFile }],
				events: [
					{
						type: `${RECIPIENT_ORIGIN}::recipient_file::RecipientAdded`,
						json: { file: FILE_ID, recipient: "0xffa0" },
					},
				],
			}),
			TYPES,
		);
		expect(item).toMatchObject({
			kind: "share",
			file: { id: FILE_ID, name: null },
			recipient: `0x${"ffa0".padStart(64, "0")}`,
		});
	});

	it("keeps a failed transaction, marked as failed", () => {
		const item = classifyTransaction(
			transaction({
				succeeded: false,
				calls: [{ module: "system", fn: "extend_blob" }],
				changed: [blobChange],
			}),
			TYPES,
		);
		expect(item).toMatchObject({ kind: "extend", succeeded: false });
	});

	it("ignores another package's function of the same name", () => {
		const lookalike = classifyTransaction(
			transaction({
				calls: [{ module: "system", fn: "register_blob" }],
				changed: [
					{
						objectId: BLOB_ID,
						type: "0x00000000000000000000000000000000000000000000000000000000000000ab::blob::Blob",
					},
				],
			}),
			TYPES,
		);
		expect(lookalike).toBeNull();
	});

	it("ignores transactions with no Walrus or Morse action, such as a relay tip", () => {
		expect(
			classifyTransaction(
				transaction({
					changed: [
						{
							objectId: SYSTEM_ID,
							type: "0x2::coin::Coin<0x2::sui::SUI>",
						},
					],
				}),
				TYPES,
			),
		).toBeNull();
	});

	it("skips Morse actions when the network has no RecipientFile package", () => {
		expect(
			classifyTransaction(
				transaction({
					calls: [{ module: "recipient_file", fn: "add_recipient" }],
					changed: [{ objectId: FILE_ID, type: TYPES.recipientFile }],
				}),
				{ ...TYPES, recipientFile: null },
			),
		).toBeNull();
	});
});

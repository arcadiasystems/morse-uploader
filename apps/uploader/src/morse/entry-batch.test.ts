import { AccessPolicy, accessPolicyToU8 } from "@arcadiasystems/morse-sdk";
import { bcs } from "@mysten/sui/bcs";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { describe, expect, it } from "vitest";
import {
	ACCESS_POLICY_PUBLIC,
	buildAddEntriesTransaction,
	type EntryCollection,
	type EntryInput,
	MAX_ENTRIES_PER_TRANSACTION,
} from "./entry-batch";

const COLLECTION: EntryCollection = {
	packageId: `0x${"ab".repeat(32)}`,
	publicationId: `0x${"01".repeat(32)}`,
	publisherCapId: `0x${"02".repeat(32)}`,
	collectionName: "gallery",
};
const QUILT = `0x${"03".repeat(32)}`;
const PATCH_ID = Uint8Array.from({ length: 37 }, (_, index) => index);
const OPTION_BYTES = bcs.option(bcs.vector(bcs.u8()));

function entry(overrides: Partial<EntryInput> = {}): EntryInput {
	return {
		name: "index.html",
		contentType: "text/html",
		blobObjectId: QUILT,
		quiltPatchId: PATCH_ID,
		...overrides,
	};
}

type TransactionData = ReturnType<Transaction["getData"]>;
type Input = TransactionData["inputs"][number];

/** One Move call's argument inputs, by position, as the transaction holds them. */
interface Call {
	target: { package: string; module: string; function: string };
	typeArguments: readonly string[];
	/** The input index each argument points at. */
	indices: readonly number[];
	input: (position: number) => Input;
}

function moveCalls(transaction: Transaction): Call[] {
	const data = transaction.getData();
	return data.commands.map((command) => {
		const call = command.MoveCall;
		if (command.$kind !== "MoveCall" || !call)
			throw new Error(`Expected a MoveCall, got ${command.$kind}.`);
		const indices = call.arguments.map((argument) => {
			if (argument.$kind !== "Input")
				throw new Error(`Expected an input argument, got ${argument.$kind}.`);
			return argument.Input;
		});
		return {
			target: {
				package: call.package,
				module: call.module,
				function: call.function,
			},
			typeArguments: call.typeArguments,
			indices,
			input: (position) => {
				const index = indices[position];
				const input = index === undefined ? undefined : data.inputs[index];
				if (!input) throw new Error(`No input at argument ${position}.`);
				return input;
			},
		};
	});
}

function objectId(input: Input): string {
	if (input.$kind !== "UnresolvedObject" || !input.UnresolvedObject)
		throw new Error(`Expected an object input, got ${input.$kind}.`);
	return input.UnresolvedObject.objectId;
}

function pureBytes(input: Input): Uint8Array {
	if (input.$kind !== "Pure" || !input.Pure)
		throw new Error(`Expected a pure input, got ${input.$kind}.`);
	return fromBase64(input.Pure.bytes);
}

describe("buildAddEntriesTransaction (publication::add_entry_to_collection)", () => {
	it("uses morse-sdk's public access policy byte", () => {
		expect(ACCESS_POLICY_PUBLIC).toBe(accessPolicyToU8(AccessPolicy.Public));
	});

	it("adds one Move call per entry to the Morse package", () => {
		const calls = moveCalls(
			buildAddEntriesTransaction(COLLECTION, [entry(), entry(), entry()]),
		);
		expect(calls).toHaveLength(3);
		for (const call of calls) {
			expect(call.target).toEqual({
				package: COLLECTION.packageId,
				module: "publication",
				function: "add_entry_to_collection",
			});
			expect(call.typeArguments).toEqual([]);
			expect(call.indices).toHaveLength(10);
		}
	});

	it("shares the publication and cap between calls and passes each entry's blob", () => {
		const other = `0x${"04".repeat(32)}`;
		const calls = moveCalls(
			buildAddEntriesTransaction(COLLECTION, [
				entry(),
				entry({ blobObjectId: other, quiltPatchId: null }),
			]),
		);
		const [first, second] = calls;
		if (!first || !second) throw new Error("Expected two calls.");
		expect(first.indices.slice(0, 2)).toEqual(second.indices.slice(0, 2));
		expect([objectId(first.input(0)), objectId(first.input(1))]).toEqual([
			COLLECTION.publicationId,
			COLLECTION.publisherCapId,
		]);
		expect(objectId(first.input(4))).toBe(QUILT);
		expect(objectId(second.input(4))).toBe(other);
	});

	it("encodes the entry as addEntry does: public, unencrypted, no seal id", () => {
		const [call] = moveCalls(
			buildAddEntriesTransaction(COLLECTION, [entry({ name: "assets/a.png" })]),
		);
		if (!call) throw new Error("Expected one call.");
		const pure = (position: number) => pureBytes(call.input(position));
		expect(bcs.string().parse(pure(2))).toBe("gallery");
		expect(bcs.string().parse(pure(3))).toBe("assets/a.png");
		expect(OPTION_BYTES.parse(pure(5))).toEqual(Array.from(PATCH_ID));
		expect(bcs.string().parse(pure(6))).toBe("text/html");
		expect(bcs.bool().parse(pure(7))).toBe(false);
		expect(bcs.u8().parse(pure(8))).toBe(ACCESS_POLICY_PUBLIC);
		expect(OPTION_BYTES.parse(pure(9))).toBeNull();
	});

	it("passes no patch id for a standalone blob", () => {
		const [call] = moveCalls(
			buildAddEntriesTransaction(COLLECTION, [entry({ quiltPatchId: null })]),
		);
		if (!call) throw new Error("Expected one call.");
		expect(OPTION_BYTES.parse(pureBytes(call.input(5)))).toBeNull();
	});

	it("holds 1 to 25 entries per transaction", () => {
		expect(MAX_ENTRIES_PER_TRANSACTION).toBe(25);
		expect(() => buildAddEntriesTransaction(COLLECTION, [])).toThrow(
			RangeError,
		);
		expect(() =>
			buildAddEntriesTransaction(
				COLLECTION,
				Array.from({ length: MAX_ENTRIES_PER_TRANSACTION + 1 }, () => entry()),
			),
		).toThrow(RangeError);
		expect(
			moveCalls(
				buildAddEntriesTransaction(
					COLLECTION,
					Array.from({ length: MAX_ENTRIES_PER_TRANSACTION }, () => entry()),
				),
			),
		).toHaveLength(MAX_ENTRIES_PER_TRANSACTION);
	});
});

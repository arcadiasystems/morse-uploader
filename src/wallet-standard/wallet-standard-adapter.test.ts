import {
	type ObjectReader,
	type TransactionExecutor,
	TransportError,
} from "@arcadiasystems/morse-sdk";

type AdapterClient = TransactionExecutor & ObjectReader;

import type { Transaction } from "@mysten/sui/transactions";
import { describe, expect, it, vi } from "vitest";
import { WalletStandardAdapter } from "./wallet-standard-adapter.js";

const address = `0x${"1".repeat(64)}`;
const objId = `0x${"a".repeat(64)}`;

function makeTx(): Transaction {
	return { setSenderIfNotSet: vi.fn() } as unknown as Transaction;
}

// A finalized, successful transaction response from waitForTransaction.
const finalizedOk = {
	$kind: "Transaction",
	Transaction: {
		digest: "0xdigest",
		effects: {
			gasUsed: { computationCost: "10", storageCost: "5", storageRebate: "3" },
			changedObjects: [{ idOperation: "Created", objectId: objId }],
		},
		objectTypes: { [objId]: "0xpkg::m::T" },
	},
};

const failed = {
	$kind: "FailedTransaction",
	FailedTransaction: { effects: { status: { error: { message: "boom" } } } },
};

function makeClient(over: Partial<AdapterClient>): AdapterClient {
	return {
		waitForTransaction: vi.fn(),
		simulateTransaction: vi.fn(),
		getObject: vi.fn(),
		...over,
	} as unknown as AdapterClient;
}

describe("WalletStandardAdapter.signAndExecuteTransaction", () => {
	it("signs, waits, and parses the receipt", async () => {
		const client = makeClient({
			waitForTransaction: vi.fn().mockResolvedValue(finalizedOk),
		});
		const signAndExecute = vi.fn().mockResolvedValue({ digest: "0xdigest" });
		const adapter = new WalletStandardAdapter(address, signAndExecute, client);

		const receipt = await adapter.signAndExecuteTransaction(makeTx());
		expect(receipt.digest).toBe("0xdigest");
		expect(receipt.gasUsedMist).toBe(12n);
		expect(receipt.createdObjects).toHaveLength(1);
	});

	it("backfills a created-object type missing from the receipt via getObject", async () => {
		const finalizedNoTypes = {
			$kind: "Transaction",
			Transaction: {
				digest: "0xdigest",
				effects: {
					gasUsed: {
						computationCost: "10",
						storageCost: "5",
						storageRebate: "3",
					},
					changedObjects: [{ idOperation: "Created", objectId: objId }],
				},
				objectTypes: {},
			},
		};
		const getObject = vi
			.fn()
			.mockResolvedValue({ object: { objectId: objId, type: "0xpkg::m::T" } });
		const client = makeClient({
			waitForTransaction: vi.fn().mockResolvedValue(finalizedNoTypes),
			getObject,
		});
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn().mockResolvedValue({ digest: "0xdigest" }),
			client,
		);

		const receipt = await adapter.signAndExecuteTransaction(makeTx());
		expect(getObject).toHaveBeenCalledWith(
			expect.objectContaining({ objectId: objId }),
		);
		expect(receipt.createdObjects).toEqual([
			{ objectId: objId, objectType: "0xpkg::m::T" },
		]);
	});

	it("wraps a wallet signing error as TransportError", async () => {
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn().mockRejectedValue(new Error("user rejected")),
			makeClient({}),
		);
		await expect(adapter.signAndExecuteTransaction(makeTx())).rejects.toThrow(
			TransportError,
		);
	});

	it("throws TransportError on a failed transaction", async () => {
		const client = makeClient({
			waitForTransaction: vi.fn().mockResolvedValue(failed),
		});
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn().mockResolvedValue({ digest: "0xdigest" }),
			client,
		);
		await expect(adapter.signAndExecuteTransaction(makeTx())).rejects.toThrow(
			/transaction failed: boom/,
		);
	});

	it("forwards an abort signal to waitForTransaction", async () => {
		const waitForTransaction = vi.fn().mockResolvedValue(finalizedOk);
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn().mockResolvedValue({ digest: "0xdigest" }),
			makeClient({ waitForTransaction }),
		);
		const { signal } = new AbortController();
		await adapter.signAndExecuteTransaction(makeTx(), signal);
		expect(waitForTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ signal }),
		);
	});

	it("stringifies a non-Error rejection", async () => {
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn().mockRejectedValue("nope"),
			makeClient({}),
		);
		await expect(adapter.signAndExecuteTransaction(makeTx())).rejects.toThrow(
			/wallet sign-and-execute failed: nope/,
		);
	});
});

describe("WalletStandardAdapter.simulateTransaction", () => {
	it("sets the sender and returns per-command bcs values", async () => {
		const client = makeClient({
			simulateTransaction: vi.fn().mockResolvedValue({
				$kind: "Simulation",
				commandResults: [
					{
						returnValues: [
							{ bcs: new Uint8Array([1]) },
							{ bcs: new Uint8Array([2]) },
						],
					},
				],
			}),
		});
		const adapter = new WalletStandardAdapter(address, vi.fn(), client);
		const tx = makeTx();

		const values = await adapter.simulateTransaction(tx);
		expect(tx.setSenderIfNotSet).toHaveBeenCalledWith(adapter.address);
		expect(values).toEqual([[new Uint8Array([1]), new Uint8Array([2])]]);
	});

	it("throws TransportError when simulation fails", async () => {
		const client = makeClient({
			simulateTransaction: vi.fn().mockResolvedValue(failed),
		});
		const adapter = new WalletStandardAdapter(address, vi.fn(), client);
		await expect(adapter.simulateTransaction(makeTx())).rejects.toThrow(
			TransportError,
		);
	});

	it("forwards a signal and defaults missing commandResults to empty", async () => {
		const simulateTransaction = vi
			.fn()
			.mockResolvedValue({ $kind: "Simulation" });
		const adapter = new WalletStandardAdapter(
			address,
			vi.fn(),
			makeClient({ simulateTransaction }),
		);
		const { signal } = new AbortController();
		const values = await adapter.simulateTransaction(makeTx(), signal);
		expect(simulateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ signal }),
		);
		expect(values).toEqual([]);
	});
});

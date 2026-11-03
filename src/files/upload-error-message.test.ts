import { TransportError } from "@arcadiasystems/morse-sdk";
import { describe, expect, it } from "vitest";
import { FileTooLargeError } from "./file-too-large-error.js";
import { uploadErrorMessage } from "./upload-error-message.js";

const WAL =
	"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL";
const OWNER =
	"0x830bd528f47068329ddbc9fcbd1f0ead051e01b0538897bb260c4c299f44ba3e";

function walrusShortfall(
	coinType = WAL,
	required = "16626709",
	available = "0",
) {
	return new TransportError(
		`Walrus call failed: Insufficient balance of ${coinType} for owner ${OWNER}. Required: ${required}, Available: ${available}`,
		{ operation: "walrus.startBlobUpload" },
	);
}

describe("uploadErrorMessage", () => {
	it("names the coin and scales the amounts", () => {
		const message = uploadErrorMessage(walrusShortfall(), "mainnet");
		expect(message.title).toBe("Not enough WAL");
		expect(message.description).toContain("needs 0.016626709 WAL");
		expect(message.description).toContain("has 0 WAL");
		expect(message.description).toContain("no faucet on mainnet");
	});

	it("points at the testnet exchange for testnet", () => {
		const message = uploadErrorMessage(walrusShortfall(), "testnet");
		expect(message.description).toContain("stake-wal.wal.app");
	});

	it("handles a SUI shortfall", () => {
		const message = uploadErrorMessage(
			walrusShortfall("0x2::sui::SUI", "2500000000", "1250000000"),
			"testnet",
		);
		expect(message.title).toBe("Not enough SUI");
		expect(message.description).toContain("needs 2.5 SUI");
		expect(message.description).toContain("has 1.25 SUI");
		expect(message.description).toContain("faucet.sui.io");
	});

	it("reads the shortfall off a nested cause", () => {
		const wrapped = new Error("upload failed", { cause: walrusShortfall() });
		expect(uploadErrorMessage(wrapped, "mainnet").title).toBe("Not enough WAL");
	});

	it("reports an unknown coin in raw units rather than guessing decimals", () => {
		const message = uploadErrorMessage(
			walrusShortfall("0xabc::usdc::USDC", "42", "0"),
			"mainnet",
		);
		expect(message.title).toBe("Not enough USDC");
		expect(message.description).toContain("needs 42 USDC");
	});

	it("titles a file too large for the relay's tip cap", () => {
		const error = new FileTooLargeError({
			sizeBytes: 52_428_800,
			afterEncryption: false,
			limit: { maxBytes: 42_327_820, maxTipMist: 10_000_000n },
		});
		const message = uploadErrorMessage(error, "mainnet");
		expect(message.title).toBe("File too large");
		expect(message.description).toBe(error.message);
		expect(message.cause).toBe(error);
	});

	it("falls back to the SDK message for anything else", () => {
		const message = uploadErrorMessage(
			new TransportError("connection reset", {
				operation: "walrus.uploadBlob",
			}),
			"mainnet",
		);
		expect(message.title).toBe("Network issue");
		expect(message.description).toContain("connection reset");
	});

	it("keeps the original error as the cause", () => {
		const error = walrusShortfall();
		expect(uploadErrorMessage(error, "mainnet").cause).toBe(error);
	});
});

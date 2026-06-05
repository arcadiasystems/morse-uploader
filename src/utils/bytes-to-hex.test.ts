import { describe, expect, it } from "vitest";
import { bytesToHex } from "./bytes-to-hex.js";
import { hexToBytes } from "./hex-to-bytes.js";

describe("bytesToHex / hexToBytes", () => {
	it("encodes bytes to lowercase hex", () => {
		expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
	});

	it("round-trips through hexToBytes", () => {
		const bytes = new Uint8Array([1, 2, 3, 250, 0, 128]);
		expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
	});

	it("accepts a 0x prefix when decoding", () => {
		expect(hexToBytes("0x00ff")).toEqual(new Uint8Array([0, 255]));
	});
});

import type {
	MorsePackageConfig,
	WalrusWriteAdapter,
} from "@arcadiasystems/morse-sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MorseUploaderProvider } from "../context/morse-uploader-provider.js";
import type { MorseUploaderContextValue } from "../types.js";
import { MorseUploader } from "./morse-uploader.js";

function makeValue(): MorseUploaderContextValue {
	return {
		config: {} as unknown as MorsePackageConfig,
		walrus: {
			uploadBlob: vi
				.fn()
				.mockResolvedValue({ blobId: "blobABC", blobObjectId: "0xo" }),
			uploadQuilt: vi.fn(),
		} as unknown as WalrusWriteAdapter,
		shareUrl: { appBaseUrl: "https://app.test" },
	} as MorseUploaderContextValue;
}

function makeFile(): File {
	return {
		name: "r.pdf",
		type: "application/pdf",
		size: 1024,
		arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
	} as unknown as File;
}

describe("MorseUploader (skin smoke test)", () => {
	it("uploads a dropped file in simple blob mode and shows the CID", async () => {
		render(
			<MorseUploaderProvider value={makeValue()}>
				<MorseUploader />
			</MorseUploaderProvider>,
		);

		const zone = screen.getByRole("button", {
			name: "Drag files here or browse",
		});
		fireEvent.drop(zone, { dataTransfer: { files: [makeFile()] } });
		expect(screen.getByText("r.pdf")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Upload 1 file/ }));
		await waitFor(() => expect(screen.getByText("blobABC")).toBeTruthy());
		expect(
			screen.getByRole("link", { name: "Open" }).getAttribute("href"),
		).toBe("https://app.test/f/blobABC");
	});
});

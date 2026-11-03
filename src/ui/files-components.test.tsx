import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "../files/morse-files-provider.js";
import type { MorseFilesHandles } from "../files/types.js";
import { MorseFileDownloader } from "./morse-file-downloader.js";
import { MorseFileUploader } from "./morse-file-uploader.js";

function provider(handles: MorseFilesHandles) {
	return ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("MorseFileUploader", () => {
	it("renders the dropzone, cost, and upload button", () => {
		const handles = {
			network: "testnet",
			adapter: {},
			config: {},
			walrusWrite: {},
			seal: {},
		} as unknown as MorseFilesHandles;
		const Wrapper = provider(handles);
		render(
			<Wrapper>
				<MorseFileUploader />
			</Wrapper>,
		);
		expect(screen.getByText(/Drag a file here/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
		expect(screen.getByText(/^\$/)).toBeTruthy();
	});

	it("shows the encrypt label when encrypt is set", () => {
		const handles = {
			network: "testnet",
			adapter: {},
			config: {},
			walrusWrite: {},
			seal: {},
		} as unknown as MorseFilesHandles;
		const Wrapper = provider(handles);
		render(
			<Wrapper>
				<MorseFileUploader encrypt recipients={["0xbob" as never]} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: "Encrypt and upload" }),
		).toBeTruthy();
	});
});

describe("MorseFileDownloader", () => {
	function downloaderHandles(sealPrefix: Uint8Array | null) {
		return {
			reader: {
				getRecipientFile: vi.fn().mockResolvedValue({
					id: "0xfile",
					name: "note.txt",
					contentType: "text/plain",
					size: 5,
					members: [],
					blobId: "blob",
				}),
				getRecipientFileSealPrefix: vi.fn().mockResolvedValue(sealPrefix),
			},
			walrusRead: { readBlob: vi.fn() },
			seal: {},
			signer: {},
			client: {},
			config: {},
			address: "0xme",
		} as unknown as MorseFilesHandles;
	}

	it("renders metadata and a download action for a public file", async () => {
		const Wrapper = provider(downloaderHandles(null));
		render(
			<Wrapper>
				<MorseFileDownloader fileId={"0xfile" as never} />
			</Wrapper>,
		);
		await waitFor(() => expect(screen.getByText("note.txt")).toBeTruthy());
		expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
	});

	it("asks for the full link when an encrypted file's link has no Seal material", async () => {
		const user = userEvent.setup();
		const handles = downloaderHandles(new Uint8Array([1, 2, 3]));
		const Wrapper = provider(handles);
		render(
			<Wrapper>
				<MorseFileDownloader fileId={"0xfile" as never} />
			</Wrapper>,
		);
		await user.click(await screen.findByRole("button", { name: "Download" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Link is incomplete");
		expect(alert.textContent).toContain("Ask the sender for the full link.");
		expect(handles.walrusRead.readBlob).not.toHaveBeenCalled();
	});
});

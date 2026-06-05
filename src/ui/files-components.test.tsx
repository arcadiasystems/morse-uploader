import { render, screen, waitFor } from "@testing-library/react";
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
	it("renders metadata and a download action for a public file", async () => {
		const handles = {
			reader: {
				getRecipientFile: vi.fn().mockResolvedValue({
					id: "0xfile",
					name: "note.txt",
					contentType: "text/plain",
					size: 5,
					members: [],
					blobId: "blob",
				}),
			},
			walrusRead: {},
			seal: {},
			signer: {},
			client: {},
			config: {},
			address: "0xme",
		} as unknown as MorseFilesHandles;
		const Wrapper = provider(handles);
		render(
			<Wrapper>
				<MorseFileDownloader fileId={"0xfile" as never} />
			</Wrapper>,
		);
		await waitFor(() => expect(screen.getByText("note.txt")).toBeTruthy());
		expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
	});
});

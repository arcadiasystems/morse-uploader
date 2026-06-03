import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MorseFile } from "../types.js";
import { FileList } from "./file-list.js";

function makeFile(id: number, encrypted = false): MorseFile {
	return {
		publicationId: "0xp",
		collectionName: "files",
		entryId: id,
		name: `f${id}`,
		revisionId: 0,
		contentType: "text/plain",
		encrypted,
		sealId: null,
		blobRef: { kind: "blob", blobObjectId: "0xb" },
	} as unknown as MorseFile;
}

describe("FileList", () => {
	it("renders the empty label", () => {
		render(<FileList files={[]} emptyLabel="None yet" />);
		expect(screen.getByText("None yet")).toBeTruthy();
	});

	it("renders default rows with encryption state", () => {
		render(<FileList files={[makeFile(1), makeFile(2, true)]} />);
		expect(screen.getByText("f1")).toBeTruthy();
		expect(screen.getByText("Encrypted")).toBeTruthy();
		expect(screen.getByText("Public")).toBeTruthy();
	});

	it("uses a custom renderFile", () => {
		render(
			<FileList
				files={[makeFile(1)]}
				renderFile={(file) => <span>custom-{file.name}</span>}
			/>,
		);
		expect(screen.getByText("custom-f1")).toBeTruthy();
	});
});

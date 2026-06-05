import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { MorseFilesHandles } from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";
import { useRecipientFile } from "./use-recipient-file.js";

const file = {
	id: "0xfile",
	owner: "0xme",
	blobId: "blob",
	name: "n.txt",
	contentType: "text/plain",
	size: 1,
	members: ["0xbob"],
	createdAtMs: 0,
};

function wrap(handles: MorseFilesHandles) {
	return ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
	);
}

describe("files context + read hook", () => {
	it("useMorseFilesContext throws outside a provider", () => {
		expect(() => renderHook(() => useMorseFilesContext())).toThrow();
	});

	it("useRecipientFile loads the file on mount", async () => {
		const handles = {
			reader: { getRecipientFile: vi.fn().mockResolvedValue(file) },
		} as unknown as MorseFilesHandles;
		const { result } = renderHook(() => useRecipientFile("0xfile" as never), {
			wrapper: wrap(handles),
		});
		await waitFor(() => expect(result.current.status).toBe("success"));
		expect(result.current.file?.name).toBe("n.txt");
	});
});

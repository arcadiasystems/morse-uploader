import { toSuiAddress } from "@arcadiasystems/morse-sdk";
import { SessionKey, UserError } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MorseFilesProvider } from "./morse-files-provider.js";
import type { FileDecryptInput, MorseFilesHandles } from "./types.js";
import { useFileDecrypt } from "./use-file-decrypt.js";

vi.mock("@mysten/seal", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mysten/seal")>();
	return {
		...actual,
		SessionKey: { create: vi.fn().mockResolvedValue({ id: "session" }) },
	};
});

const plaintext = new Uint8Array([7, 7]);

const me = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));
const other = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(2));

function makeHandles(decrypt: ReturnType<typeof vi.fn>): MorseFilesHandles {
	return {
		seal: { decryptUnderRecipientFile: decrypt },
		walrusRead: { readBlob: vi.fn().mockResolvedValue(new Uint8Array([9])) },
		signer: me,
		client: {},
		config: { packageId: "0xpkg" },
		address: me.toSuiAddress(),
	} as unknown as MorseFilesHandles;
}
function wrap(handles: MorseFilesHandles) {
	return ({ children }: { children: ReactNode }) => (
		<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
	);
}

const input = {
	file: { id: "0xfile", blobId: "blob" },
	sealIdPrefix: new Uint8Array([1, 2, 3]),
	sealNonce: new Uint8Array([4, 5]),
} as unknown as FileDecryptInput;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useFileDecrypt", () => {
	it("reads the blob, creates a session, and decrypts under the file", async () => {
		const decrypt = vi.fn().mockResolvedValue(plaintext);
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(makeHandles(decrypt)),
		});
		await act(async () => {
			await result.current.decrypt(input);
		});
		expect(result.current.status).toBe("success");
		expect(result.current.data).toBe(plaintext);
		expect(decrypt).toHaveBeenCalledWith(
			new Uint8Array([9]),
			expect.objectContaining({ fileId: "0xfile" }),
		);
	});

	it("records an error when decryption fails", async () => {
		const decrypt = vi.fn().mockRejectedValue(new Error("nope"));
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(makeHandles(decrypt)),
		});
		await act(async () => {
			await expect(result.current.decrypt(input)).rejects.toThrow("nope");
		});
		expect(result.current.status).toBe("error");
	});
});

describe("useFileDecrypt without Seal key servers", () => {
	it("rejects with an actionable message instead of throwing on null", async () => {
		// handles.seal is null on a network that pins no key servers, which is
		// mainnet unless the consumer supplies a credential. The hook must say
		// so rather than blow up on a null dereference.
		const handles = {
			...makeHandles(vi.fn()),
			seal: null,
		} as unknown as MorseFilesHandles;
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(handles),
		});
		await act(async () => {
			await expect(result.current.decrypt(input)).rejects.toThrow(
				/sealKeyServers/,
			);
		});
		expect(result.current.status).toBe("error");
		expect((result.current.error as Error).message).toMatch(
			/No Seal key servers/,
		);
	});
});

describe("useFileDecrypt session cache", () => {
	it("reuses one session across files but re-signs after a wallet switch", async () => {
		const create = vi.mocked(SessionKey.create);
		const decrypt = vi.fn().mockResolvedValue(plaintext);
		let handles = makeHandles(decrypt);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<MorseFilesProvider value={handles}>{children}</MorseFilesProvider>
		);
		const { result, rerender } = renderHook(() => useFileDecrypt(), {
			wrapper,
		});

		await act(async () => {
			await result.current.decrypt(input);
			await result.current.decrypt(input);
		});
		expect(create).toHaveBeenCalledTimes(1);

		handles = {
			...handles,
			signer: other,
			address: toSuiAddress(other.toSuiAddress()),
		};
		rerender();
		await act(async () => {
			await result.current.decrypt(input);
		});
		expect(create).toHaveBeenCalledTimes(2);
		expect(create).toHaveBeenLastCalledWith(
			expect.objectContaining({ address: other.toSuiAddress() }),
		);
	});
});

describe("useFileDecrypt with a signer for another account", () => {
	it("rejects before creating a session, so nothing is signed or cached", async () => {
		// @mysten/seal 1.5 no longer makes this check itself; without it the
		// wallet would sign, the key servers would refuse, and the mismatched
		// session would stay cached for the address.
		const create = vi.mocked(SessionKey.create);
		const decrypt = vi.fn().mockResolvedValue(plaintext);
		const handles: MorseFilesHandles = {
			...makeHandles(decrypt),
			signer: other,
		};
		const { result } = renderHook(() => useFileDecrypt(), {
			wrapper: wrap(handles),
		});
		await act(async () => {
			await expect(result.current.decrypt(input)).rejects.toThrow(UserError);
		});
		expect(create).not.toHaveBeenCalled();
		expect(decrypt).not.toHaveBeenCalled();
		expect(result.current.status).toBe("error");
		expect((result.current.error as Error).message).toMatch(
			/^Signer address does not match session key address/,
		);
	});
});

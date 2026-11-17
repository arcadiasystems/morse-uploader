import type { RecipientFile } from "@arcadiasystems/morse-sdk";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useEffect, useId, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import { Icon } from "@/components/icon";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { saveBytes } from "@/lib/save-bytes";
import { shortenAddress } from "@/lib/shorten-address";
import { useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import {
	mediaTypeOf,
	previewPlan,
	TEXT_PREVIEW_BYTES,
} from "@/manage/preview-plan";
import { findRecipientFile } from "@/morse/find-recipient-file";
import {
	addRecipient,
	type OpenStep,
	openWithRecipientFile,
} from "@/morse/recipient-file-access";
import type { OpenedBlob } from "@/morse/seal-access";
import { explorerObjectUrl, explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";

type Opening =
	| { kind: "idle" }
	| { kind: "working"; step: OpenStep }
	| { kind: "failed"; message: string }
	| {
			kind: "done";
			opened: OpenedBlob["kind"];
			bytes: Uint8Array<ArrayBuffer>;
	  };

const STEP_NOTES: Record<OpenStep, string> = {
	checking: "Checking the blob against its RecipientFile…",
	signing: "Sign the message in your wallet…",
	decrypting: "Asking Seal key servers for the key…",
};

/**
 * An encrypted blob (PROTOCOL-NOTES section 11): the lock, its Morse
 * RecipientFile, decrypt on download for wallets the file allows, and, for
 * the file's owner, adding a recipient. Decrypting first checks the blob
 * against its RecipientFile's Seal prefix (`seal-access`), then asks the
 * wallet to sign a message (no transaction, nothing paid), and Seal's key
 * servers check that the wallet is a member before they release the key.
 */
export function EncryptedSection({
	network,
	blob,
	readable,
	actions,
}: {
	network: NetworkConfig;
	blob: Pick<BlobRecord, "objectId" | "blobId" | "name">;
	/** Certified and not expired: the ciphertext can still be read. */
	readable: boolean;
	actions: WalletActions | null;
}) {
	const client = useCurrentClient();
	const owner = actions?.address ?? null;
	const lookup = useChainRead(
		owner === null ? null : `${network.id}:${owner}:rf:${blob.objectId}`,
		(signal) =>
			owner === null
				? Promise.reject(new Error("No wallet is connected."))
				: findRecipientFile({ client, network, owner, blob, signal }),
	);
	const file = lookup.read.status === "ready" ? lookup.read.data : null;

	return (
		<section className="sec" aria-labelledby="insp-encrypted">
			<h4 id="insp-encrypted">Encrypted</h4>
			<p className="lock">
				<Icon name="lock" />
				<span>
					Encrypted with Seal before upload. Only wallets on its RecipientFile
					can decrypt it. The blob id, name and size stay public.
				</span>
			</p>
			{lookup.read.status === "idle" || lookup.read.status === "loading" ? (
				<p className="note" role="status">
					Looking for this blob's RecipientFile…
				</p>
			) : lookup.read.status === "error" ? (
				<p className="note warn" role="alert">
					Could not look up its RecipientFile: {errorMessage(lookup.read.error)}{" "}
					<button className="cp" type="button" onClick={lookup.refresh}>
						Try again
					</button>
				</p>
			) : file === null ? (
				<p className="note">
					None of this wallet's RecipientFiles points at this blob, so there is
					no access policy to decrypt it with.
				</p>
			) : (
				<>
					<p className="note">
						RecipientFile{" "}
						<a
							href={explorerObjectUrl(network, file.id)}
							target="_blank"
							rel="noopener noreferrer"
							title={file.id}
						>
							{shortenAddress(file.id)}
						</a>{" "}
						· {file.name} · {formatBytes(BigInt(file.size))} decrypted.
					</p>
					{network.seal.kind === "unavailable" ? (
						<p className="note warn">{network.seal.reason}</p>
					) : !readable ? (
						<p className="note">
							Its storage is not live, so the ciphertext cannot be read to
							decrypt.
						</p>
					) : actions ? (
						<Decrypt
							key={file.id}
							network={network}
							blobId={blob.blobId}
							file={file}
							actions={actions}
						/>
					) : null}
					<Recipients
						network={network}
						file={file}
						actions={actions}
						onChanged={lookup.refresh}
					/>
				</>
			)}
		</section>
	);
}

function Decrypt({
	network,
	blobId,
	file,
	actions,
}: {
	network: NetworkConfig;
	blobId: string;
	file: RecipientFile;
	actions: WalletActions;
}) {
	const client = useCurrentClient();
	const [state, setState] = useState<Opening>({ kind: "idle" });
	const member = file.members.some((address) => address === actions.address);

	async function openFile() {
		try {
			const opened = await openWithRecipientFile({
				client,
				network,
				blobId,
				fileId: file.id,
				address: actions.address,
				signPersonalMessage: actions.signPersonalMessage,
				onStep: (step) => setState({ kind: "working", step }),
			});
			const bytes = new Uint8Array(opened.bytes);
			saveBytes(bytes, file.name, file.contentType);
			setState({ kind: "done", opened: opened.kind, bytes });
		} catch (error) {
			setState({ kind: "failed", message: describeActionError(error) });
		}
	}

	return (
		<>
			{member ? null : (
				<p className="note warn">
					This wallet is not on the RecipientFile, so Seal will refuse to
					release the key.
				</p>
			)}
			<div className="acts">
				<button
					className="btn solid sm"
					type="button"
					disabled={state.kind === "working"}
					aria-busy={state.kind === "working"}
					onClick={openFile}
				>
					{state.kind === "working"
						? state.step === "checking"
							? "Checking…"
							: "Decrypting…"
						: state.kind === "done"
							? state.opened === "public"
								? "Download again"
								: "Decrypt and download again"
							: "Decrypt and download"}
				</button>
			</div>
			<p className="hint">
				The blob is checked against its RecipientFile first, so you sign only
				for a file Morse Uploader can decrypt. Your wallet signs a message, not
				a transaction: nothing is paid. One signature covers decrypts for 10
				minutes.
			</p>
			{state.kind === "working" ? (
				<p className="note" role="status">
					{STEP_NOTES[state.step]}
				</p>
			) : state.kind === "failed" ? (
				<p className="note warn" role="alert">
					{state.message}
				</p>
			) : state.kind === "done" ? (
				<>
					{state.opened === "public" ? (
						<p className="note warn" role="status">
							This file is not encrypted: its RecipientFile has no Seal prefix
							and the blob is not Seal ciphertext, so anyone with its blob id
							can read it. Saved as {file.name}, with nothing signed.
						</p>
					) : (
						<p className="note ok" role="status">
							Decrypted in this browser and saved as {file.name}.
						</p>
					)}
					<OpenedPreview
						bytes={state.bytes}
						opened={state.opened}
						file={file}
					/>
				</>
			) : null}
		</>
	);
}

/** The opened file, shown like any preview; decrypted bytes never leave the browser. */
function OpenedPreview({
	bytes,
	opened,
	file,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	opened: OpenedBlob["kind"];
	file: RecipientFile;
}) {
	const mediaType = mediaTypeOf(file.contentType, file.name);
	const plan = previewPlan(mediaType, BigInt(bytes.length));
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	useEffect(() => {
		if (plan.kind !== "image") return;
		const url = URL.createObjectURL(
			new Blob([bytes], { type: mediaType ?? "application/octet-stream" }),
		);
		setImageUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [bytes, mediaType, plan.kind]);

	if (plan.kind === "text")
		return (
			<div className="thumb">
				<pre>
					{new TextDecoder("utf-8", { fatal: false }).decode(
						bytes.slice(0, TEXT_PREVIEW_BYTES),
					)}
				</pre>
			</div>
		);
	if (plan.kind === "image" && imageUrl)
		return (
			<div className="thumb">
				{/* biome-ignore lint/performance/noImgElement: the image is an object URL of bytes in this browser, not served by a host. */}
				<img
					src={imageUrl}
					alt={opened === "decrypted" ? `Decrypted ${file.name}` : file.name}
				/>
			</div>
		);
	return null;
}

function Recipients({
	network,
	file,
	actions,
	onChanged,
}: {
	network: NetworkConfig;
	file: RecipientFile;
	actions: WalletActions | null;
	onChanged: () => void;
}) {
	const ids = useId();
	const client = useCurrentClient();
	const [text, setText] = useState("");
	const [adding, setAdding] = useState<
		| { kind: "idle" }
		| { kind: "signing" }
		| { kind: "failed"; message: string }
		| { kind: "done"; digest: string; recipient: string }
	>({ kind: "idle" });
	const isOwner = actions !== null && file.owner === actions.address;
	const candidate = text.trim();
	const valid = isValidSuiAddress(candidate);
	const normalized = valid ? normalizeSuiAddress(candidate) : null;
	const already =
		normalized !== null && file.members.some((member) => member === normalized);

	async function add() {
		if (!actions || normalized === null) return;
		setAdding({ kind: "signing" });
		try {
			const digest = await addRecipient({
				executor: actions.executor,
				client,
				network: network.id,
				fileId: file.id,
				recipient: normalized,
			});
			setAdding({ kind: "done", digest, recipient: normalized });
			setText("");
			onChanged();
		} catch (error) {
			setAdding({ kind: "failed", message: describeActionError(error) });
		}
	}

	return (
		<div className="panel">
			<b>Recipients</b>
			<ul className="members" aria-label="Wallets that can decrypt">
				{file.members.map((member) => (
					<li key={member} title={member}>
						{shortenAddress(member)}
						{actions !== null && member === actions.address ? " (you)" : ""}
						{member === file.owner ? " · owner" : ""}
					</li>
				))}
			</ul>
			{isOwner ? (
				<>
					<div className="field-row">
						<label className="hint" htmlFor={`${ids}-recipient`}>
							Add a wallet that can decrypt this file
						</label>
						<input
							id={`${ids}-recipient`}
							type="text"
							placeholder="0x…"
							spellCheck={false}
							autoComplete="off"
							value={text}
							aria-invalid={candidate !== "" && !valid}
							onChange={(event) => setText(event.currentTarget.value)}
						/>
					</div>
					{candidate !== "" && !valid ? (
						<p className="note warn">That is not a Sui address.</p>
					) : already ? (
						<p className="note">That wallet can already decrypt it.</p>
					) : null}
					<div className="acts">
						<button
							className="btn sm"
							type="button"
							disabled={!valid || already || adding.kind === "signing"}
							aria-busy={adding.kind === "signing"}
							onClick={add}
						>
							{adding.kind === "signing"
								? "Confirm in your wallet…"
								: "Add recipient · 1 tx"}
						</button>
					</div>
					{adding.kind === "failed" ? (
						<p className="note warn" role="alert">
							{adding.message}
						</p>
					) : adding.kind === "done" ? (
						<p className="note ok" role="status">
							Added {shortenAddress(adding.recipient)}. They can decrypt it with
							their own wallet.{" "}
							<a
								href={explorerTxUrl(network, adding.digest)}
								target="_blank"
								rel="noopener noreferrer"
							>
								View transaction
							</a>
						</p>
					) : null}
				</>
			) : (
				<p className="note">
					Only the RecipientFile's owner can add recipients.
				</p>
			)}
		</div>
	);
}

import { type ReactElement, useState } from "react";
import type { MorseFileUploaderProps } from "../files/types.js";
import { uploadErrorMessage } from "../files/upload-error-message.js";
import { uploadPhaseLabel } from "../files/upload-phase-label.js";
import { uploadPhases } from "../files/upload-phases.js";
import { useFileUpload } from "../files/use-file-upload.js";
import { useMorseFilesContext } from "../files/use-morse-files-context.js";
import { useStorageCostEstimate } from "../files/use-storage-cost-estimate.js";
import { useClipboard } from "../primitives/use-clipboard.js";
import { useDropzone } from "../primitives/use-dropzone.js";
import { clamp } from "../utils/clamp.js";
import { formatBytes } from "../utils/format-bytes.js";
import { formatUsd } from "../utils/format-usd.js";

const DEFAULT_EPOCHS = 5;
// Walrus caps a lease at 53 epochs ahead on both networks.
const WALRUS_MAX_EPOCHS = 53;

/**
 * Drop-in file uploader for the 0.4.0 RecipientFile flow. Pick a file, choose a
 * storage duration, and upload. Encryption and the recipient set are controlled
 * by props (`encrypt`, `recipients`); the connected wallet is auto-added as a
 * recipient on chain. Emits the completed upload (with seal material and share
 * link) via `onUploaded`. All logic lives in hooks; this component only renders.
 */
export function MorseFileUploader(props: MorseFileUploaderProps): ReactElement {
	const {
		className,
		recipients,
		encrypt = false,
		defaultEpochs,
		minEpochs = 1,
		maxEpochs = WALRUS_MAX_EPOCHS,
		onUploaded,
	} = props;

	const [file, setFile] = useState<File | null>(null);
	const [epochs, setEpochs] = useState(defaultEpochs ?? DEFAULT_EPOCHS);
	const upload = useFileUpload();
	const clipboard = useClipboard();
	const { network } = useMorseFilesContext();

	const { estimate } = useStorageCostEstimate({
		sizeBytes: file?.size ?? 0,
		epochs,
		encrypt,
	});

	const { getRootProps, getInputProps } = useDropzone({
		multiple: false,
		ariaLabel: "Choose a file to upload",
		onFiles: (files) => setFile(files[0] ?? null),
	});

	const handleUpload = async () => {
		if (file === null) {
			return;
		}
		const result = await upload.upload({
			file,
			epochs,
			encrypt,
			...(recipients === undefined ? {} : { recipients }),
		});
		onUploaded?.(result);
	};

	const handleReset = () => {
		upload.reset();
		setFile(null);
	};

	const phases = uploadPhases(encrypt);
	const activeIndex = upload.phase === null ? -1 : phases.indexOf(upload.phase);
	const errorMessage =
		upload.error === null ? null : uploadErrorMessage(upload.error, network);

	return (
		<div className={`mu-uploader ${className ?? ""}`} data-mu="uploader">
			<div className="mu-dropzone" {...getRootProps()}>
				<input className="mu-file-input" {...getInputProps()} />
				<span className="mu-dropzone-icon" aria-hidden="true" />
				{file === null ? (
					<>
						<span className="mu-dropzone-hint">
							Drag a file here, or click to browse
						</span>
						<span className="mu-dropzone-sub">Any file type</span>
					</>
				) : (
					<>
						<span className="mu-dropzone-hint">{file.name}</span>
						<span className="mu-dropzone-sub">
							{formatBytes(file.size)} · click to replace
						</span>
					</>
				)}
			</div>

			<label className="mu-field">
				<span className="mu-field-label">Storage duration (epochs)</span>
				<input
					className="mu-epochs-input"
					type="number"
					min={minEpochs}
					max={maxEpochs}
					value={epochs}
					onChange={(event) =>
						setEpochs(
							clamp(
								Number.parseInt(event.target.value, 10) || minEpochs,
								minEpochs,
								maxEpochs,
							),
						)
					}
				/>
				<span
					className="mu-field-help"
					title={`Walrus storage is a lease, not permanent. You can buy at most ${maxEpochs} epochs ahead. An epoch is about 1 day on testnet and about 2 weeks on mainnet.`}
				>
					{`≈ ${Math.round(estimate.days)} day${
						Math.round(estimate.days) === 1 ? "" : "s"
					} of storage · max ${maxEpochs} epochs`}
				</span>
			</label>

			<div className="mu-cost" data-mu="cost">
				<span className="mu-cost-label">
					{encrypt
						? "Estimated storage cost (encrypted)"
						: "Estimated storage cost"}
				</span>
				<span className="mu-cost-value">{formatUsd(estimate.usd)}</span>
			</div>

			<button
				type="button"
				className="mu-upload"
				disabled={file === null || upload.status === "uploading"}
				onClick={() => {
					void handleUpload();
				}}
			>
				{upload.status === "uploading"
					? "Uploading..."
					: encrypt
						? "Encrypt and upload"
						: "Upload"}
			</button>

			{upload.status === "uploading" ? (
				<ol className="mu-stepper" data-mu="stepper">
					{phases.map((phase, index) => (
						<li
							key={phase}
							className="mu-step"
							data-state={
								index < activeIndex
									? "done"
									: index === activeIndex
										? "active"
										: "pending"
							}
						>
							<span className="mu-step-dot" aria-hidden="true">
								{index + 1}
							</span>
							<span className="mu-step-label">{uploadPhaseLabel(phase)}</span>
						</li>
					))}
				</ol>
			) : null}

			{errorMessage !== null ? (
				<div className="mu-error" role="alert">
					<strong>{errorMessage.title}</strong>
					<span>{errorMessage.description}</span>
				</div>
			) : null}

			{upload.data !== null ? (
				<div className="mu-result" data-mu="result">
					<span className="mu-result-head">
						<span className="mu-result-badge" aria-hidden="true">
							✓
						</span>
						<strong>
							{upload.data.encrypted ? "Encrypted and uploaded" : "Uploaded"}
						</strong>
					</span>
					<div className="mu-result-actions">
						<a
							className="mu-upload mu-result-link"
							href={upload.data.shareLink}
							target="_blank"
							rel="noreferrer"
						>
							Open share link
						</a>
						<button
							type="button"
							className="mu-ghost mu-result-copy"
							onClick={() => {
								void clipboard.copy(upload.data?.shareLink ?? "");
							}}
						>
							{clipboard.copied ? "Copied!" : "Copy link"}
						</button>
						<button type="button" className="mu-ghost" onClick={handleReset}>
							Upload another
						</button>
					</div>
					<code className="mu-result-id">{upload.data.fileId}</code>
					{upload.data.encrypted ? (
						<span className="mu-result-note">
							The share link carries the decryption key; only recipients can
							open it.
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}

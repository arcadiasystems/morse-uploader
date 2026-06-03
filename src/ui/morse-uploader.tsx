import { type ReactElement, useState } from "react";
import { DEFAULT_EPOCHS } from "../constants/default-epochs.js";
import { useMorseUploaderContext } from "../context/use-morse-uploader-context.js";
import { useEpochCostEstimate } from "../hooks/use-epoch-cost-estimate.js";
import { useMorseUploader } from "../hooks/use-morse-uploader.js";
import { CostEstimate } from "../primitives/cost-estimate.js";
import { Dropzone } from "../primitives/dropzone.js";
import { EncryptToggle } from "../primitives/encrypt-toggle.js";
import { EpochControl } from "../primitives/epoch-control.js";
import { ProgressIndicator } from "../primitives/progress-indicator.js";
import type { MorseUploaderProps } from "../types.js";
import { formatBytes } from "../utils/format-bytes.js";

/**
 * Opinionated, themeable default skin. Assembles the headless hooks and
 * primitives into a working uploader; all logic stays in those hooks. Style via
 * the shipped stylesheet (`@arcadiasystems/morse-uploader/styles.css`) and the
 * `--mu-*` CSS variables, or restyle the `mu-*` classes. No inline styles.
 */
export function MorseUploader(props: MorseUploaderProps): ReactElement {
	const ctx = useMorseUploaderContext();
	const {
		className,
		allowEncrypt = true,
		minEpochs = 1,
		maxEpochs,
		epochPresets,
		formatWal,
		formatSui,
	} = props;

	const [files, setFiles] = useState<File[]>([]);
	const [epochs, setEpochs] = useState(
		props.defaultEpochs ?? ctx.defaultEpochs ?? DEFAULT_EPOCHS,
	);
	const [encrypt, setEncrypt] = useState(false);
	const uploader = useMorseUploader();

	const totalSize = files.reduce((sum, file) => sum + file.size, 0);
	const cost = useEpochCostEstimate({
		sizeBytes: totalSize,
		epochs,
		encrypt,
		enabled: ctx.walrusClient !== undefined && files.length > 0,
	});

	const removeAt = (index: number) =>
		setFiles((prev) => prev.filter((_, i) => i !== index));

	const handleUpload = async () => {
		for (const file of files) {
			await uploader.upload({ file, epochs, encrypt });
		}
		setFiles([]);
	};

	return (
		<div className={`mu-uploader ${className ?? ""}`} data-mu="uploader">
			<Dropzone
				className="mu-dropzone"
				label="Drag files here or browse"
				onFiles={(dropped) => setFiles((prev) => [...prev, ...dropped])}
			>
				<span className="mu-dropzone-hint">Drag files here, or browse</span>
			</Dropzone>

			{files.length > 0 ? (
				<ul className="mu-selected">
					{files.map((file, index) => (
						<li
							className="mu-selected-row"
							key={`${file.name}-${file.size}-${file.lastModified}`}
						>
							<span className="mu-selected-name">{file.name}</span>
							<span className="mu-selected-size">{formatBytes(file.size)}</span>
							<span className="mu-selected-type">{file.type || "unknown"}</span>
							<button
								type="button"
								className="mu-remove"
								aria-label={`Remove ${file.name}`}
								onClick={() => removeAt(index)}
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			) : null}

			<EpochControl
				className="mu-epochs"
				value={epochs}
				onChange={setEpochs}
				min={minEpochs}
				{...(maxEpochs === undefined ? {} : { max: maxEpochs })}
				{...(epochPresets === undefined ? {} : { presets: epochPresets })}
			/>

			{allowEncrypt ? (
				<EncryptToggle
					className="mu-encrypt"
					checked={encrypt}
					onChange={setEncrypt}
					disabled={ctx.seal === undefined}
					label={
						ctx.seal === undefined ? "Encrypt (unavailable)" : "Encrypt files"
					}
				/>
			) : null}

			<CostEstimate
				className="mu-cost"
				estimate={cost.estimate}
				status={cost.status}
				{...(formatWal === undefined ? {} : { formatWal })}
				{...(formatSui === undefined ? {} : { formatSui })}
			/>

			<button
				type="button"
				className="mu-upload"
				disabled={files.length === 0 || uploader.status === "uploading"}
				onClick={() => {
					void handleUpload();
				}}
			>
				{uploader.status === "uploading"
					? "Uploading..."
					: `Upload ${files.length} file(s)`}
			</button>

			<ProgressIndicator
				className="mu-progress"
				phase={uploader.phase}
				status={uploader.status}
			/>

			{uploader.data !== null ? (
				<div className="mu-result" data-mu="result">
					<span className="mu-result-cid">{uploader.data.result.blobId}</span>
					{uploader.data.shareUrl !== null ? (
						<a
							className="mu-result-link"
							href={uploader.data.shareUrl}
							target="_blank"
							rel="noreferrer"
						>
							Open
						</a>
					) : null}
				</div>
			) : null}
		</div>
	);
}

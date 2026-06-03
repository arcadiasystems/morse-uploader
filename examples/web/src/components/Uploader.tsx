import {
	Dropzone,
	fetchEpochSchedule,
	formatBytes,
	formatTokenAmount,
	type ProgressPhase,
	useEpochCostEstimate,
	useMorseUploader,
	useMorseUploaderContext,
} from "@arcadiasystems/morse-uploader";
import {
	Calendar,
	Check,
	Coins,
	Copy,
	ExternalLink,
	File as FileIcon,
	Loader2,
	Trash2,
	Upload,
	UploadCloud,
} from "lucide-react";
import { formatUserMessage } from "@arcadiasystems/morse-sdk";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_EPOCHS_AHEAD } from "../morse-config";

// Walrus caps storage at max_epochs_ahead = 53 on both testnet and mainnet
// (per the Walrus docs). Only the epoch duration differs (testnet 1 day,
// mainnet 2 weeks) and is read from chain; this is just a fallback.
const MAX_EPOCHS = MAX_EPOCHS_AHEAD;
const FALLBACK_EPOCH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_AHEAD = 10;

function toDateInputValue(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

function phaseLabel(phase: ProgressPhase | null): string {
	switch (phase) {
		case "encrypting":
			return "Encrypting...";
		case "submitting":
			return "Submitting...";
		default:
			return "Uploading...";
	}
}

export function Uploader() {
	const ctx = useMorseUploaderContext();
	const [files, setFiles] = useState<File[]>([]);
	const [untilMs, setUntilMs] = useState(
		() => Date.now() + DEFAULT_DAYS_AHEAD * FALLBACK_EPOCH_MS,
	);
	const [epochMs, setEpochMs] = useState(FALLBACK_EPOCH_MS);
	const [copied, setCopied] = useState(false);
	const uploader = useMorseUploader();
	const toastId = useRef<string | number | undefined>(undefined);

	// Surface upload progress/result/error as toasts. The library is headless
	// and ships no toaster; we just react to the hook's status here.
	useEffect(() => {
		if (uploader.status === "uploading") {
			const message = phaseLabel(uploader.phase);
			if (toastId.current === undefined) {
				toastId.current = toast.loading(message);
			} else {
				toast.loading(message, { id: toastId.current });
			}
		} else if (uploader.status === "success" && uploader.data !== null) {
			toast.success("Uploaded to Walrus", {
				id: toastId.current,
				description: uploader.data.result.blobId,
			});
			toastId.current = undefined;
		} else if (uploader.status === "error") {
			// Log the raw error and show the SDK's human-readable copy.
			console.error("[morse-uploader] upload failed:", uploader.error);
			const { title, description } = formatUserMessage(uploader.error);
			toast.error(title, { id: toastId.current, description });
			toastId.current = undefined;
		}
	}, [uploader.status, uploader.phase, uploader.data, uploader.error]);

	// Read the real epoch duration so the date <-> epoch conversion is accurate.
	useEffect(() => {
		const source = ctx.walrusClient;
		if (source === undefined) {
			return;
		}
		let cancelled = false;
		fetchEpochSchedule(source)
			.then((schedule) => {
				if (!cancelled && schedule.epochDurationMs > 0) {
					setEpochMs(schedule.epochDurationMs);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [ctx.walrusClient]);

	const now = Date.now();
	const maxMs = now + MAX_EPOCHS * epochMs;
	// The picker is unbounded, but Walrus storage is a finite lease: the chosen
	// date is clamped to the network cap (max_epochs_ahead) for the actual upload.
	const rawEpochs = Math.max(1, Math.ceil((untilMs - now) / epochMs));
	const epochs = Math.min(MAX_EPOCHS, rawEpochs);
	const clampedToCap = rawEpochs > MAX_EPOCHS;

	const totalSize = files.reduce((sum, file) => sum + file.size, 0);
	const cost = useEpochCostEstimate({
		sizeBytes: totalSize,
		epochs,
		enabled: files.length > 0,
	});

	const removeAt = (index: number) =>
		setFiles((prev) => prev.filter((_, i) => i !== index));

	const setDaysAhead = (days: number) =>
		setUntilMs(Date.now() + days * epochMs);

	const onUpload = async () => {
		for (const file of files) {
			await uploader.upload({ file, epochs });
		}
		setFiles([]);
	};

	const copyCid = async () => {
		if (uploader.data === null) {
			return;
		}
		await navigator.clipboard.writeText(uploader.data.result.blobId);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<section className="card uploader">
			<Dropzone
				className="dz"
				label="Drag files here or browse"
				onFiles={(dropped) => setFiles((prev) => [...prev, ...dropped])}
			>
				{({ isDragging }) => (
					<div className="dz-inner">
						<UploadCloud size={28} className="dz-icon" />
						<p className="dz-title">
							{isDragging ? "Drop to add" : "Drag files here, or click to browse"}
						</p>
						<p className="muted dz-sub">
							Stored on Walrus. Your wallet pays and signs the upload.
						</p>
					</div>
				)}
			</Dropzone>

			{files.length > 0 ? (
				<ul className="files">
					{files.map((file, index) => (
						<li
							className="file"
							key={`${file.name}-${file.size}-${file.lastModified}`}
						>
							<FileIcon size={16} className="muted" />
							<span className="file-name">{file.name}</span>
							<span className="muted file-meta">{formatBytes(file.size)}</span>
							<button
								type="button"
								className="icon-btn"
								aria-label={`Remove ${file.name}`}
								onClick={() => removeAt(index)}
							>
								<Trash2 size={16} />
							</button>
						</li>
					))}
				</ul>
			) : null}

			<div className="field">
				<div className="field-head">
					<label htmlFor="store-until">Store until</label>
					<span className="muted">{epochs} epochs (Walrus lease)</span>
				</div>
				<div className="date-row">
					<Calendar size={16} className="muted" />
					<input
						id="store-until"
						type="date"
						className="date"
						value={toDateInputValue(untilMs)}
						min={toDateInputValue(now + epochMs)}
						onChange={(event) => {
							const picked = new Date(event.target.value).getTime();
							if (!Number.isNaN(picked)) {
								setUntilMs(Math.max(now + epochMs, picked));
							}
						}}
					/>
				</div>
				<div className="presets">
					<button type="button" className="chip" onClick={() => setDaysAhead(7)}>
						1 week
					</button>
					<button type="button" className="chip" onClick={() => setDaysAhead(30)}>
						1 month
					</button>
					<button
						type="button"
						className="chip"
						onClick={() => setUntilMs(maxMs)}
					>
						Max
					</button>
				</div>
				{clampedToCap ? (
					<p className="muted note">
						Walrus storage is a lease, not permanent. It is capped at{" "}
						{MAX_EPOCHS} epochs, so the file will be stored until about{" "}
						{new Date(maxMs).toLocaleDateString()}.
					</p>
				) : null}
			</div>

			<div className="cost">
				<Coins size={16} className="muted" />
				{cost.status === "loading" ? (
					<span className="muted">Estimating storage cost...</span>
				) : null}
				{cost.status === "error" ? (
					<span className="muted">Cost estimate unavailable</span>
				) : null}
				{cost.status === "idle" ? (
					<span className="muted">Add a file to estimate storage cost</span>
				) : null}
				{cost.status === "success" && cost.estimate !== null ? (
					<span>
						~{formatTokenAmount(cost.estimate.walFrost)} WAL{" "}
						<span className="muted">(paid from your wallet, plus gas)</span>
					</span>
				) : null}
			</div>

			<button
				type="button"
				className="primary"
				disabled={files.length === 0 || uploader.status === "uploading"}
				onClick={() => {
					void onUpload();
				}}
			>
				{uploader.status === "uploading" ? (
					<>
						<Loader2 size={16} className="spin" />
						{phaseLabel(uploader.phase)}
					</>
				) : (
					<>
						<Upload size={16} />
						Upload {files.length > 0 ? files.length : ""} file
						{files.length === 1 ? "" : "s"}
					</>
				)}
			</button>

			{uploader.status === "error" ? (
				<p className="error">{formatUserMessage(uploader.error).description}</p>
			) : null}

			{uploader.data !== null ? (
				<div className="result">
					<Check size={16} className="ok" />
					<code className="cid">{uploader.data.result.blobId}</code>
					<button
						type="button"
						className="icon-btn"
						aria-label="Copy content id"
						onClick={() => {
							void copyCid();
						}}
					>
						{copied ? <Check size={16} className="ok" /> : <Copy size={16} />}
					</button>
					{uploader.data.shareUrl !== null ? (
						<a
							className="icon-btn"
							href={uploader.data.shareUrl}
							target="_blank"
							rel="noreferrer"
							aria-label="Open file"
						>
							<ExternalLink size={16} />
						</a>
					) : null}
				</div>
			) : null}
		</section>
	);
}

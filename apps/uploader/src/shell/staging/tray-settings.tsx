import { type ReactNode, useId, useState } from "react";
import type { EpochClock } from "@/blobs/epoch-clock";
import { formatShortDate } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import type { PublishTarget } from "@/morse/read-publish-targets";
import type { NetworkConfig } from "@/network/networks";
import type { TrayQuote } from "@/staging/tray-quote";
import type { TraySettings } from "@/staging/tray-settings";
import { storageEndMs } from "@/upload/periods";
import { PUBLISH_BLOCKER_TEXT } from "@/upload/publish-rules";
import type { UploadMode } from "@/upload/upload-plan";
import { SwitchRow } from "../switch-row";
import { PublishPicker } from "./publish-picker";
import { listText } from "./sign-help";

type SettingId = "keep" | "encryption" | "folders" | "publish";

interface TraySettingsProps {
	network: NetworkConfig;
	settings: TraySettings;
	/** `null` until the prices are read. */
	tray: TrayQuote | null;
	clock: EpochClock | null;
	/** When the prices were read; dates are estimated from then. */
	pricedAtMs: number | null;
	/** Whether this network's Seal settings are read and encryption can run. */
	sealAvailable: boolean;
	publishTargets: ChainRead<PublishTarget[]>;
	onRetryPublishTargets: () => void;
	onChange: (change: Partial<TraySettings>) => void;
}

const FOLDER_MODES: readonly {
	mode: UploadMode;
	label: string;
	help: string;
}[] = [
	{
		mode: "quilt",
		label: "One quilt per folder",
		help: "Keeps paths, one storage object, cheapest for many small files. Readers address files by path inside the quilt.",
	},
	{
		mode: "per-file",
		label: "One blob per file",
		help: "Every file gets its own id and lifetime. Use when files will be shared or extended separately.",
	},
];

/**
 * The tray's four settings (handover item 2) as the design's tiles: keep
 * for, encryption, folder handling and also publish. A tile opens its
 * editor under the tiles; one is open at a time.
 */
export function TraySettingsPanel(props: TraySettingsProps) {
	const ids = useId();
	const [open, setOpen] = useState<SettingId | null>(null);
	const { settings, tray } = props;
	const folders: UploadMode = tray?.sealing ? "per-file" : settings.mode;
	const tiles: { id: SettingId; label: string; value: string; act: string }[] =
		[
			{ id: "keep", label: "Keep for", value: keepValue(props), act: "change" },
			{
				id: "encryption",
				label: "Encryption",
				value: (tray ? tray.sealing : settings.encrypt)
					? "Seal, per file"
					: "Off",
				act: "seal",
			},
			{
				id: "folders",
				label: "Folders",
				value: folders === "quilt" ? "Quilt per folder" : "Blob per file",
				act: "change",
			},
			{
				id: "publish",
				label: "Also publish",
				value: publishValue(settings, tray),
				act: "morse",
			},
		];
	const editorId = `${ids}-editor`;
	return (
		<>
			<fieldset className="sets">
				<legend className="sr-only">Upload settings</legend>
				{tiles.map((tile) => (
					<button
						key={tile.id}
						id={`${ids}-${tile.id}`}
						type="button"
						className={open === tile.id ? "set on" : "set"}
						aria-expanded={open === tile.id}
						aria-controls={open === tile.id ? editorId : undefined}
						onClick={() =>
							setOpen((current) => (current === tile.id ? null : tile.id))
						}
					>
						<small>{tile.label}</small>
						<b>
							<span className="v">{tile.value}</span>
							<em>{tile.act}</em>
						</b>
					</button>
				))}
			</fieldset>
			{open !== null ? (
				<section
					className="edit"
					id={editorId}
					aria-labelledby={`${ids}-${open}`}
				>
					{open === "keep" ? <KeepEditor {...props} /> : null}
					{open === "encryption" ? <EncryptionEditor {...props} /> : null}
					{open === "folders" ? (
						<FoldersEditor {...props} folders={folders} name={`${ids}-mode`} />
					) : null}
					{open === "publish" ? <PublishEditor {...props} /> : null}
				</section>
			) : null}
		</>
	);
}

/** The Keep for tile: the period or epochs, "…" until the epoch clock is read. */
function keepValue({ settings, tray }: TraySettingsProps): string {
	const permanent = settings.deletable ? "" : ", permanent";
	const keep = tray ? tray.keep : settings.keep;
	if (keep?.kind === "epochs")
		return `${keep.epochs} ${keep.epochs === 1 ? "epoch" : "epochs"}${permanent}`;
	if (!tray) return "…";
	if (keep === null) return "No period fits";
	const period = tray.periods.find((option) => option.id === keep.id);
	return `${period?.label ?? keep.id}${permanent}`;
}

function publishValue(settings: TraySettings, tray: TrayQuote | null): string {
	if (!settings.publish || tray?.blocker) return "No";
	if (tray?.choice) return tray.choice.collectionName;
	return "Choose where";
}

function KeepEditor({
	network,
	settings,
	tray,
	clock,
	pricedAtMs,
	onChange,
}: TraySettingsProps) {
	const ids = useId();
	if (!tray || !clock || pricedAtMs === null)
		return <p className="note">Reading the epoch clock…</p>;
	const { periods, keep, epochs } = tray;
	const unavailable = periods.filter((period) => !period.fits);
	const endsAt =
		epochs === null
			? null
			: formatShortDate(storageEndMs(epochs, clock), pricedAtMs);
	const maxDays = Math.floor(
		(storageEndMs(network.maxEpochsAhead, clock) - pricedAtMs) / 86_400_000,
	);
	return (
		<>
			<fieldset className="keep-group">
				<legend className="sr-only">Keep on Walrus for</legend>
				<div className="keep">
					{periods.map((period) => {
						const on = keep?.kind === "period" && keep.id === period.id;
						return (
							<label
								key={period.id}
								className={on ? "on" : period.fits ? undefined : "off"}
							>
								<input
									type="radio"
									name={`${ids}-keep`}
									checked={on}
									disabled={!period.fits}
									onChange={() =>
										onChange({ keep: { kind: "period", id: period.id } })
									}
								/>
								{period.label}
							</label>
						);
					})}
				</div>
				{unavailable.length > 0 ? (
					<p className="note">
						{listText(unavailable.map((period) => period.label))}{" "}
						{unavailable.length === 1 ? "needs" : "need"} more than{" "}
						{network.maxEpochsAhead} epochs, the most Walrus stores ahead (about{" "}
						{maxDays} days on {network.label}).
						{unavailable.map((period) =>
							period.fits || period.availableAtMs === null
								? null
								: ` ${period.label} is available again on ${formatShortDate(period.availableAtMs, pricedAtMs)}.`,
						)}
					</p>
				) : null}
				<label className="epochs">
					Or exactly
					<input
						type="number"
						inputMode="numeric"
						min={1}
						max={network.maxEpochsAhead}
						value={epochs ?? ""}
						onChange={(event) => {
							const value = Number.parseInt(event.currentTarget.value, 10);
							if (Number.isInteger(value))
								onChange({
									keep: {
										kind: "epochs",
										epochs: Math.min(
											network.maxEpochsAhead,
											Math.max(1, value),
										),
									},
								});
						}}
					/>
					{epochs === 1 ? "epoch" : "epochs"}
					{endsAt ? (
						<span className="muted">· until about {endsAt}</span>
					) : null}
				</label>
			</fieldset>
			<SwitchRow
				title="Deletable"
				checked={settings.deletable}
				onChange={(deletable) => onChange({ deletable })}
			>
				Lets you delete it early; its storage returns to your wallet to reuse.
				Off keeps it for the whole paid period.
			</SwitchRow>
		</>
	);
}

function EncryptionEditor({
	network,
	settings,
	sealAvailable,
	onChange,
}: TraySettingsProps) {
	return (
		<SwitchRow
			title="Encrypt with Seal"
			// The setting itself, held until this network's Seal settings are read.
			checked={settings.encrypt && network.seal.kind === "available"}
			disabled={!sealAvailable}
			onChange={(encrypt) => onChange({ encrypt })}
		>
			{network.seal.kind === "unavailable"
				? `Off on ${network.label}. ${network.seal.reason}`
				: "Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public."}
		</SwitchRow>
	);
}

function FoldersEditor({
	tray,
	folders,
	name,
	onChange,
}: TraySettingsProps & { folders: UploadMode; name: string }) {
	const sealing = tray?.sealing ?? false;
	return (
		<fieldset className="opts" disabled={sealing}>
			<legend className="sr-only">Folder handling</legend>
			{FOLDER_MODES.map(({ mode, label, help }) => {
				const on = folders === mode;
				return (
					<label key={mode} className={on ? "opt on" : "opt"}>
						<input
							type="radio"
							name={name}
							value={mode}
							checked={on}
							onChange={() => onChange({ mode })}
						/>
						<i aria-hidden="true" />
						<span>
							<b>{label}</b>
							<small>{help}</small>
						</span>
					</label>
				);
			})}
			{sealing ? (
				<p className="note">
					Seal encrypts each file on its own, so folders upload as one blob per
					file.
				</p>
			) : null}
		</fieldset>
	);
}

function PublishEditor({
	settings,
	tray,
	publishTargets,
	onRetryPublishTargets,
	onChange,
}: TraySettingsProps) {
	const blocker = tray?.blocker ?? null;
	const on = settings.publish && blocker === null;
	let help: ReactNode;
	if (blocker)
		help =
			blocker.kind === "name-too-long"
				? `Morse entry names are at most 256 bytes; ${blocker.name} is longer.`
				: PUBLISH_BLOCKER_TEXT[blocker.kind];
	else if (on && tray?.choice)
		help = `Adds each file as an entry in ${tray.choice.publicationName} · ${tray.choice.collectionName}.`;
	else
		help =
			"Adds each file as an entry in a publication you can write to, one signature each.";
	return (
		<SwitchRow
			title="Also publish to Morse"
			tone="bone"
			checked={on}
			disabled={blocker !== null}
			onChange={(publish) => onChange({ publish })}
			extra={
				on ? (
					<PublishPicker
						read={publishTargets}
						choices={tray?.choices ?? []}
						choice={tray?.choice ?? null}
						onChoose={(publishTo) => onChange({ publishTo })}
						onRetry={onRetryPublishTargets}
						mode={tray?.collection ?? null}
					/>
				) : null
			}
		>
			{help}
		</SwitchRow>
	);
}

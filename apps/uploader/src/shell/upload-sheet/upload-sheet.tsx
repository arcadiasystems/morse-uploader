import { useId, useMemo, useRef, useState } from "react";
import { TokenAmount } from "@/components/token-amount";
import type { Balances } from "@/funds/types";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatShortDate } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import type { LocalLibrary } from "@/local/local-library";
import { usePublishTargets } from "@/morse/use-publish-targets";
import type { NetworkConfig } from "@/network/networks";
import type { TransferBatch } from "@/transfers/transfer-job";
import { type PeriodId, periodOptions, storageEndMs } from "@/upload/periods";
import {
	choiceKey,
	collectionMode,
	PUBLISH_BLOCKER_TEXT,
	type PublishChoice,
	publishBlocker,
	publishChoices,
} from "@/upload/publish-rules";
import {
	blobAttributes,
	buildUploadPlan,
	type UploadMode,
	type UploadPlan,
} from "@/upload/upload-plan";
import { buildQuote, itemEstimates, quoteGas } from "@/upload/upload-quote";
import { useQuoteInputs, useRegisterGas } from "@/upload/use-upload-quote";
import { CostList } from "../staging/cost-list";
import { PublishPicker } from "../staging/publish-picker";
import { listText, signHelp } from "../staging/sign-help";
import { SwitchRow } from "../switch-row";
import { useModalFocus } from "../use-modal-focus";
import { TreePreview } from "./tree-preview";

interface UploadSheetProps {
	network: NetworkConfig;
	owner: string;
	library: LocalLibrary;
	selected: ReadonlySet<string>;
	balances: ChainRead<Balances>;
	/** Changes each time the sheet opens, so prices are read again. */
	session: number;
	onClose: () => void;
	onConfirm: (batch: TransferBatch) => void;
}

type Keep =
	| { kind: "period"; id: PeriodId }
	| { kind: "epochs"; epochs: number };

/**
 * The upload sheet (design/app-upload.html): what goes up, folder handling,
 * Seal and deletable, the period in epochs, the itemised cost from live
 * prices, Morse publishing and the signature count. Nothing is read from
 * disk or signed until Upload is pressed.
 */
export function UploadSheet({
	network,
	owner,
	library,
	selected,
	balances,
	session,
	onClose,
	onConfirm,
}: UploadSheetProps) {
	const ids = useId();
	const dialog = useRef<HTMLDivElement>(null);
	useModalFocus(dialog, onClose);

	const [mode, setMode] = useState<UploadMode>("quilt");
	const [encrypt, setEncrypt] = useState(false);
	const [deletable, setDeletable] = useState(true);
	const [keep, setKeep] = useState<Keep | null>(null);
	const [publishing, setPublishing] = useState(false);
	const [choiceId, setChoiceId] = useState<string | null>(null);

	const inputs = useQuoteInputs(network, session);
	const ready = inputs.status === "ready" ? inputs.data : null;
	const sealAvailable =
		network.seal.kind === "available" && ready?.seal != null;
	const sealing = encrypt && sealAvailable;

	const plan = useMemo(
		() =>
			ready
				? buildUploadPlan({
						library,
						selected,
						mode,
						seal: sealing ? ready.seal : null,
						nShards: ready.pricing.nShards,
					})
				: null,
		[ready, library, selected, mode, sealing],
	);

	const nowMs =
		inputs.status === "ready" ? inputs.readAt.getTime() : Date.now();
	const periods = ready
		? periodOptions(network.id, ready.clock, network.maxEpochsAhead, nowMs)
		: [];
	const firstFit = periods.find((period) => period.fits);
	const chosenKeep: Keep | null =
		keep ?? (firstFit ? { kind: "period", id: firstFit.id } : null);
	const epochs =
		chosenKeep?.kind === "epochs"
			? chosenKeep.epochs
			: (periods.find((period) => period.id === chosenKeep?.id && period.fits)
					?.epochs ?? null);

	const blocker = plan
		? publishBlocker(plan, { encrypt: sealing, deletable })
		: null;
	const targets = usePublishTargets(network.id, publishing ? owner : null);
	const fitsMode = plan ? collectionMode(plan) : null;
	const choices =
		targets.read.status === "ready" && fitsMode
			? publishChoices(targets.read.data, fitsMode)
			: [];
	const choice: PublishChoice | null =
		choices.find((option) => choiceKey(option) === choiceId) ??
		choices[0] ??
		null;
	const publishOn = publishing && blocker === null;

	const quote =
		plan && ready && epochs !== null
			? buildQuote({
					plan,
					epochs,
					publishing: publishOn,
					pricing: ready.pricing,
					tip: ready.tip,
				})
			: null;
	const gas = useRegisterGas(
		network,
		quote && plan && epochs !== null && plan.items.length > 0
			? {
					owner,
					epochs,
					deletable,
					items: plan.items.map((item, index) => ({
						attributes: blobAttributes(item),
						tipMaxMist: quote.tipMaxMist[index] ?? 0,
					})),
				}
			: null,
	);
	const gasMist =
		quote &&
		gas.status === "ready" &&
		gas.data.length === quote.signatures.items
			? quoteGas(quote, gas.data, network.observedGas)
			: null;

	const wallet = balances.status === "ready" ? balances.data : null;
	const walAfter = quote && wallet ? wallet.wal - quote.cost.walFrost : null;
	const suiNeeded = quote ? quote.cost.tipMist + (gasMist ?? 0n) : null;
	const suiAfter = suiNeeded !== null && wallet ? wallet.sui - suiNeeded : null;
	const short =
		(walAfter !== null && walAfter < 0n) ||
		(suiAfter !== null && suiAfter < 0n);

	const canUpload =
		plan !== null &&
		quote !== null &&
		epochs !== null &&
		plan.items.length > 0 &&
		plan.problems.length === 0 &&
		!short &&
		(!publishOn || choice !== null);

	function confirm() {
		if (!canUpload || !plan || !quote || epochs === null) return;
		const estimates = itemEstimates(
			quote,
			plan,
			publishOn,
			gas.status === "ready" ? gas.data : null,
			network.observedGas,
		);
		onConfirm({
			network: network.id,
			owner,
			jobs: plan.items.map((item, index) => ({
				plan: item,
				epochs,
				deletable,
				tipMaxMist: quote.tipMaxMist[index] ?? 0,
				publish: publishOn ? choice : null,
				estimate: estimates[index] ?? { walFrost: 0n, suiMist: null },
			})),
		});
	}

	const title = plan
		? `Upload ${plan.items.length} ${plan.items.length === 1 ? "item" : "items"} to Walrus`
		: "Upload to Walrus";
	const unavailable = periods.filter((period) => !period.fits);
	// The current epoch is partly used, so the most storage ahead is a little under 53 epochs.
	const maxDays = ready
		? Math.floor(
				(storageEndMs(network.maxEpochsAhead, ready.clock) - nowMs) /
					86_400_000,
			)
		: null;
	const endsAt =
		ready && epochs !== null
			? formatShortDate(storageEndMs(epochs, ready.clock), nowMs)
			: null;
	const keepLabel =
		chosenKeep?.kind === "period"
			? periods.find((period) => period.id === chosenKeep.id)?.label
			: null;

	return (
		<div className="scrim">
			<div
				ref={dialog}
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${ids}-title`}
				aria-describedby={`${ids}-lead`}
			>
				<div className="l">
					<div>
						<h2 id={`${ids}-title`}>{title}</h2>
						<p id={`${ids}-lead`}>
							{plan ? selectionSummary(plan) : "Reading prices…"} Nothing leaves
							this browser until you confirm.
						</p>
					</div>
					{inputs.status === "error" ? (
						<p className="problem" role="alert">
							Could not read Walrus prices: {errorMessage(inputs.error)}
						</p>
					) : null}
					<div>
						<h4>What goes up</h4>
						{plan ? (
							<TreePreview plan={plan} />
						) : (
							<div className="tree skel" aria-busy="true" />
						)}
					</div>
					<fieldset className="opts" disabled={sealing}>
						<legend>
							<h4>Folder handling</h4>
						</legend>
						{(
							[
								[
									"quilt",
									"One quilt per folder",
									"Keeps paths, one storage object, cheapest for many small files. Readers address files by path inside the quilt.",
								],
								[
									"per-file",
									"One blob per file",
									"Every file gets its own id and lifetime. Use when files will be shared or extended separately.",
								],
							] as const
						).map(([value, label, help]) => {
							const on = (sealing ? "per-file" : mode) === value;
							return (
								<label key={value} className={on ? "opt on" : "opt"}>
									<input
										type="radio"
										name={`${ids}-mode`}
										value={value}
										checked={on}
										onChange={() => setMode(value)}
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
								Seal encrypts each file on its own, so folders upload as one
								blob per file.
							</p>
						) : null}
					</fieldset>
					<SwitchRow
						title="Encrypt with Seal"
						checked={sealing}
						disabled={!sealAvailable}
						onChange={setEncrypt}
					>
						{network.seal.kind === "unavailable"
							? `Off on ${network.label}. ${network.seal.reason}`
							: "Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public."}
					</SwitchRow>
					<SwitchRow
						title="Deletable"
						checked={deletable}
						onChange={setDeletable}
					>
						Lets you delete it early; its storage returns to your wallet to
						reuse. Off keeps it for the whole paid period.
					</SwitchRow>
				</div>
				<div className="r">
					<fieldset className="keep-group">
						<legend>
							<h4>Keep on Walrus for</h4>
						</legend>
						<div className="keep">
							{periods.map((period) => {
								const on =
									chosenKeep?.kind === "period" && chosenKeep.id === period.id;
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
												setKeep({ kind: "period", id: period.id })
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
								{network.maxEpochsAhead} epochs, the most Walrus stores ahead
								{maxDays === null
									? ""
									: ` (about ${maxDays} days on ${network.label})`}
								.
								{unavailable.map((period) =>
									period.fits || period.availableAtMs === null
										? null
										: ` ${period.label} is available again on ${formatShortDate(period.availableAtMs, nowMs)}.`,
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
										setKeep({
											kind: "epochs",
											epochs: Math.min(
												network.maxEpochsAhead,
												Math.max(1, value),
											),
										});
								}}
							/>
							{epochs === 1 ? "epoch" : "epochs"}
							{endsAt ? (
								<span className="muted">· until about {endsAt}</span>
							) : null}
						</label>
					</fieldset>

					<CostList
						quote={quote}
						gasMist={gasMist}
						plan={plan}
						epochs={epochs}
						keepLabel={keepLabel ?? null}
						gas={gas}
					/>
					{gas.status === "error" ? (
						<p className="note warn">
							Network fees could not be simulated:{" "}
							{errorMessage(gas.error).replace(/\.$/, "")}. A wallet that cannot
							pay fails this simulation too; your wallet shows its fee before
							you sign.
						</p>
					) : null}
					<p className="after" aria-live="polite">
						{walAfter !== null && suiAfter !== null ? (
							short ? (
								<span className="problem">
									Not enough {walAfter < 0n ? "WAL" : "SUI"} for this upload.
									Top up from the balance menu, or upload less.
								</span>
							) : (
								<>
									Balance after:{" "}
									<TokenAmount raw={walAfter} context="detailed" /> WAL,{" "}
									<TokenAmount raw={suiAfter} context="detailed" /> SUI. Prices
									read from the Walrus system object just now.
								</>
							)
						) : (
							"Prices read from the Walrus system object when the sheet opens."
						)}
					</p>

					<SwitchRow
						title="Also publish to Morse"
						tone="bone"
						checked={publishOn}
						disabled={blocker !== null}
						onChange={setPublishing}
						extra={
							publishOn ? (
								<PublishPicker
									read={targets.read}
									choices={choices}
									choice={choice}
									onChoose={setChoiceId}
									onRetry={targets.refresh}
									mode={fitsMode}
								/>
							) : null
						}
					>
						{blocker
							? blocker.kind === "name-too-long"
								? `Morse entry names are at most 256 bytes; ${blocker.name} is longer.`
								: PUBLISH_BLOCKER_TEXT[blocker.kind]
							: choice && publishOn
								? `Adds each file as an entry in ${choice.publicationName} · ${choice.collectionName}.`
								: "Adds each file as an entry in a publication you can write to, one signature each."}
					</SwitchRow>

					<div className="acts">
						<button
							className="btn primary lg"
							type="button"
							disabled={!canUpload}
							onClick={confirm}
						>
							{quote
								? `Upload · sign ${quote.signatureTotal} ${quote.signatureTotal === 1 ? "time" : "times"}`
								: "Upload"}
						</button>
						<button className="btn text" type="button" onClick={onClose}>
							Cancel
						</button>
						<small>{signHelp(quote?.signatures ?? null)}</small>
					</div>
				</div>
			</div>
		</div>
	);
}

/** "1 folder and 2 files, 97.3 MB.", as the design opens the sheet. */
function selectionSummary(plan: UploadPlan): string {
	const parts: string[] = [];
	if (plan.folders > 0)
		parts.push(`${plan.folders} ${plan.folders === 1 ? "folder" : "folders"}`);
	if (plan.looseFiles > 0)
		parts.push(
			`${plan.looseFiles} ${plan.looseFiles === 1 ? "file" : "files"}`,
		);
	return `${listText(parts)}, ${formatBytes(BigInt(plan.contentBytes))}.`;
}

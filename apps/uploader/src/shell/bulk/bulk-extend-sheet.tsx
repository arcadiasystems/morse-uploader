import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useId, useMemo, useState } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { TokenAmount } from "@/components/token-amount";
import { type Balances, TOKEN_DECIMALS } from "@/funds/types";
import { parseDecimalAmount } from "@/lib/parse-decimal-amount";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import {
	buildExtendTransaction,
	PriceChangedError,
	readStoragePrice,
	simulateTransaction,
} from "@/manage/blob-transactions";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import { planBulkExtend } from "@/manage/bulk-extend";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { BulkSheet, LeftOutList, rowNames } from "./bulk-sheet";

/** What the sheet extends: the selected blobs, or every blob expiring within 30 days. */
export type ExtendScope = "selected" | "expiring";

type Signing =
	| { kind: "idle" }
	| { kind: "signing"; batch: number; of: number }
	| { kind: "price-changed" }
	| { kind: "failed"; message: string }
	| { kind: "done" };

/** What this sheet has signed so far: every run's transactions and the blobs they extended. */
interface Signed {
	digests: readonly string[];
	objectIds: ReadonlySet<string>;
}

const NOTHING_SIGNED: Signed = { digests: [], objectIds: new Set() };

/**
 * Extend all (PROTOCOL-NOTES section 8): one extend per blob, up to 50 in
 * a transaction, so the wallet asks once per 50, and the sheet says how
 * many times before it asks. The cost is `units × storage price × epochs`
 * per blob at the price read from the system object, the network fee comes
 * from simulating each transaction, and the balances after are shown. An
 * optional cap bounds what it spends. The price is read again before each
 * transaction; if it moved, nothing more is signed until the new cost has
 * been seen. A run that stops part way keeps what it signed, and the next
 * run plans only the blobs it has not extended, so none is paid twice.
 */
export function BulkExtendSheet({
	network,
	scope,
	rows,
	clock,
	actions,
	balances,
	onClose,
	onExtended,
}: {
	network: NetworkConfig;
	scope: ExtendScope;
	rows: readonly BlobRow[];
	clock: EpochClock;
	actions: WalletActions;
	balances: ChainRead<Balances>;
	onClose: () => void;
	onExtended: () => void;
}) {
	const ids = useId();
	const client = useCurrentClient();
	const [epochs, setEpochs] = useState(1);
	const [capText, setCapText] = useState("");
	const [priceRead, setPriceRead] = useState(0);
	const [signing, setSigning] = useState<Signing>({ kind: "idle" });
	const [signed, setSigned] = useState<Signed>(NOTHING_SIGNED);

	const { eligible, leftOut } = useMemo(
		() => bulkEligibility("extend", rows, clock, network.maxEpochsAhead),
		[rows, clock, network.maxEpochsAhead],
	);
	// Blobs this sheet already extended stay out of the next run's plan.
	const remaining = useMemo(
		() => eligible.filter((row) => !signed.objectIds.has(row.blob.objectId)),
		[eligible, signed.objectIds],
	);
	const trimmedCap = capText.trim();
	const capFrost =
		trimmedCap === "" ? null : parseDecimalAmount(trimmedCap, TOKEN_DECIMALS);
	const capInvalid = trimmedCap !== "" && capFrost === null;

	const price = useChainRead(`${network.id}:price-bulk:${priceRead}`, () =>
		readStoragePrice(client),
	).read;
	const pricePerUnit = price.status === "ready" ? price.data : null;
	const plan = useMemo(
		() =>
			pricePerUnit === null || capInvalid
				? null
				: planBulkExtend({
						rows: remaining,
						epochs,
						clock,
						maxEpochsAhead: network.maxEpochsAhead,
						pricePerUnit,
						capFrost,
					}),
		[
			remaining,
			epochs,
			clock,
			network.maxEpochsAhead,
			pricePerUnit,
			capFrost,
			capInvalid,
		],
	);

	const gas = useChainRead(
		plan && plan.items.length > 0
			? `${network.id}:bulk-extend:${plan.items.map((item) => `${item.objectId}+${item.epochs}`).join(",")}:${pricePerUnit}`
			: null,
		async (signal) => {
			if (plan === null || pricePerUnit === null)
				throw new Error("The storage price is not read yet.");
			let netMist = 0n;
			for (const batch of plan.batches) {
				const simulated = await simulateTransaction(
					client,
					buildExtendTransaction(client, batch, pricePerUnit),
					actions.address,
					signal,
				);
				netMist += simulated.netMist;
			}
			return netMist;
		},
	).read;
	const gasMist = gas.status === "ready" ? gas.data : null;
	const wallet = balances.status === "ready" ? balances.data : null;
	const walAfter = wallet && plan ? wallet.wal - plan.totalFrost : null;
	const suiAfter = wallet && gasMist !== null ? wallet.sui - gasMist : null;
	const short =
		walAfter !== null && walAfter < 0n
			? "WAL"
			: suiAfter !== null && suiAfter < 0n
				? "SUI"
				: null;
	const count = plan?.items.length ?? 0;
	const signatures = plan?.signatures ?? 0;

	async function sign() {
		if (!plan || pricePerUnit === null) return;
		let progress = signed;
		const record = (digest: string, objectIds: readonly string[]) => {
			progress = {
				digests: [...progress.digests, digest],
				objectIds: new Set([...progress.objectIds, ...objectIds]),
			};
			setSigned(progress);
		};
		try {
			for (const [index, batch] of plan.batches.entries()) {
				setSigning({
					kind: "signing",
					batch: index + 1,
					of: plan.batches.length,
				});
				if ((await readStoragePrice(client)) !== pricePerUnit)
					throw new PriceChangedError();
				const executed = await actions.executor.execute(
					buildExtendTransaction(client, batch, pricePerUnit),
				);
				record(
					executed.digest,
					batch.map((item) => item.objectId),
				);
			}
			setSigning({ kind: "done" });
		} catch (error) {
			if (error instanceof PriceChangedError) {
				setPriceRead((value) => value + 1);
				setSigning({ kind: "price-changed" });
			} else
				setSigning({ kind: "failed", message: describeActionError(error) });
		} finally {
			if (progress.digests.length > signed.digests.length) onExtended();
		}
	}

	return (
		<BulkSheet
			title={
				scope === "expiring"
					? "Extend everything expiring"
					: `Extend ${rows.length === 1 ? "1 selected blob" : `${rows.length} selected blobs`}`
			}
			intro={
				<>
					{scope === "expiring"
						? "Every blob whose storage ends within 30 days. "
						: ""}
					One transaction extends up to 50 blobs, so your wallet asks once per
					50. Nobody can pay for more than {network.maxEpochsAhead} epochs ahead
					of now, so a blob near that limit gets fewer epochs.
				</>
			}
			onClose={onClose}
			aside={
				<>
					<h4>Cost</h4>
					{price.status === "error" ? (
						<p className="note warn">{describeActionError(price.error)}</p>
					) : null}
					<dl className="cost" aria-live="polite">
						<div>
							<dt>Blobs extended</dt>
							<dd>{plan ? count : "…"}</dd>
						</div>
						<div>
							<dt>
								Storage, {epochs === 1 ? "1 epoch" : `${epochs} epochs`} each
								(WAL)
							</dt>
							<dd>
								<TokenAmount
									raw={plan?.totalFrost ?? null}
									context="detailed"
								/>
							</dd>
						</div>
						<div>
							<dt>Network fee (SUI)</dt>
							<dd>
								{gas.status === "error" ? (
									<span className="warn-text">not simulated</span>
								) : (
									<>
										≈ <TokenAmount raw={gasMist} context="detailed" />
									</>
								)}
							</dd>
						</div>
						<div>
							<dt>Signatures</dt>
							<dd>{plan ? signatures : "…"}</dd>
						</div>
						<div className="tot">
							<dt>WAL after</dt>
							<dd>
								{walAfter !== null && walAfter < 0n ? (
									<span className="warn-text">not enough</span>
								) : (
									<TokenAmount raw={walAfter} context="detailed" />
								)}
							</dd>
						</div>
						<div>
							<dt>SUI after</dt>
							<dd>
								{suiAfter !== null && suiAfter < 0n ? (
									<span className="warn-text">not enough</span>
								) : (
									<TokenAmount raw={suiAfter} context="detailed" />
								)}
							</dd>
						</div>
					</dl>
					{plan && plan.capped > 0 ? (
						<p className="note">
							{plan.capped === 1 ? "1 blob gets" : `${plan.capped} blobs get`}{" "}
							fewer epochs: the {network.maxEpochsAhead}-epoch limit.
						</p>
					) : null}
					{plan && plan.overCap.length > 0 ? (
						<p className="note">
							{plan.overCap.length === 1
								? "1 blob does"
								: `${plan.overCap.length} blobs do`}{" "}
							not fit in the cap: {rowNames(plan.overCap)}.
						</p>
					) : null}
					{gas.status === "error" ? (
						<p className="note warn">{describeActionError(gas.error)}</p>
					) : null}
					{short ? (
						<p className="note warn">
							Your wallet does not have enough {short} for this.
						</p>
					) : null}
					<SigningNote signing={signing} signed={signed} network={network} />
					<div className="acts">
						<button
							className="btn primary"
							type="button"
							disabled={
								count === 0 ||
								short !== null ||
								gas.status !== "ready" ||
								signing.kind === "signing"
							}
							aria-busy={signing.kind === "signing"}
							onClick={sign}
						>
							{signing.kind === "signing"
								? `Confirm in your wallet… ${signing.batch} of ${signing.of}`
								: `Extend ${count === 1 ? "1 blob" : `${count} blobs`} · sign ${signatures === 1 ? "once" : `${signatures} times`}`}
						</button>
						<button className="btn" type="button" onClick={onClose}>
							{signing.kind === "done" ? "Close" : "Cancel"}
						</button>
					</div>
				</>
			}
		>
			<div className="epochs">
				<label htmlFor={`${ids}-epochs`}>Extend each by</label>
				<input
					id={`${ids}-epochs`}
					data-autofocus
					type="number"
					inputMode="numeric"
					min={1}
					max={network.maxEpochsAhead}
					value={epochs}
					onChange={(event) => {
						const value = Math.floor(event.currentTarget.valueAsNumber);
						setEpochs(
							Number.isFinite(value)
								? Math.max(1, Math.min(network.maxEpochsAhead, value))
								: 1,
						);
						setSigning({ kind: "idle" });
					}}
				/>
				<span>
					{epochs === 1 ? "epoch" : "epochs"}; an epoch is{" "}
					{network.epochDays === 1 ? "1 day" : `${network.epochDays} days`} on{" "}
					{network.label}.
				</span>
			</div>
			<div className="epochs">
				<label htmlFor={`${ids}-cap`}>Spend at most</label>
				<input
					id={`${ids}-cap`}
					type="text"
					inputMode="decimal"
					placeholder="no cap"
					value={capText}
					aria-invalid={capInvalid}
					onChange={(event) => {
						setCapText(event.currentTarget.value);
						setSigning({ kind: "idle" });
					}}
				/>
				<span>WAL. Soonest to expire go first; the rest wait.</span>
			</div>
			{capInvalid ? (
				<p className="note warn">
					Type the cap as a number of WAL, such as 0.05.
				</p>
			) : null}
			<p className="note">
				{eligible.length === 0
					? "None of these blobs can be extended."
					: `${eligible.length === 1 ? "1 blob" : `${eligible.length} blobs`} can be extended: ${rowNames(eligible)}.`}
			</p>
			<LeftOutList leftOut={leftOut} maxEpochsAhead={network.maxEpochsAhead} />
		</BulkSheet>
	);
}

function SigningNote({
	signing,
	signed,
	network,
}: {
	signing: Signing;
	signed: Signed;
	network: NetworkConfig;
}) {
	const extended = signed.objectIds.size;
	const links = signed.digests.map((digest, index) => (
		<a
			key={digest}
			href={explorerTxUrl(network, digest)}
			target="_blank"
			rel="noopener noreferrer"
		>
			{signed.digests.length === 1
				? "View transaction"
				: `Transaction ${index + 1}`}
		</a>
	));
	const soFar =
		extended > 0
			? `${extended === 1 ? "1 blob" : `${extended} blobs`} extended so far. `
			: "";
	switch (signing.kind) {
		case "idle":
		case "signing":
			return extended > 0 ? (
				<p className="note" role="status">
					{soFar}
					{links}
				</p>
			) : null;
		case "price-changed":
			return (
				<p className="note warn" role="alert">
					The storage price changed since this quote. {soFar}Check the new cost
					and sign again for the rest. {links}
				</p>
			);
		case "failed":
			return (
				<p className="note warn" role="alert">
					{signing.message} {soFar}
					{links}
				</p>
			);
		case "done":
			return (
				<p className="note" role="status">
					Extended {extended === 1 ? "1 blob" : `${extended} blobs`}. {links}
				</p>
			);
	}
}

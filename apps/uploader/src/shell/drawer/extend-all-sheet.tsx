import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useId, useMemo, useRef, useState } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import { matchesFilter } from "@/blobs/filter-rows";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { TokenAmount } from "@/components/token-amount";
import type { Balances } from "@/funds/types";
import type { ChainRead } from "@/lib/use-chain-read";
import { useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import { MAX_EXTENDS_PER_TRANSACTION } from "@/manage/auto-extend";
import {
	buildExtendTransaction,
	PriceChangedError,
	readStoragePrice,
	simulateTransaction,
} from "@/manage/blob-transactions";
import { planExtend } from "@/manage/extend-rules";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { useModalFocus } from "../use-modal-focus";

export type ExtendAllScope = "expiring" | "view";

type Signing =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "price-changed" }
	| { kind: "failed"; message: string }
	| { kind: "done"; digest: string; blobs: number };

/**
 * Extend all (PROTOCOL-NOTES section 8): one transaction with one extend per
 * blob, so one signature, for the blobs expiring within 30 days or every
 * blob listed in the current view. Each blob gets the chosen epochs, or as
 * many as still fit within the 53-epoch limit.
 */
export function ExtendAllSheet({
	network,
	listed,
	viewRows,
	viewLabel,
	initialScope,
	actions,
	balances,
	onClose,
	onExtended,
}: {
	network: NetworkConfig;
	listed: ListedBlobs;
	/** The rows the Walrus pane lists now: its view and search. */
	viewRows: readonly BlobRow[];
	viewLabel: string;
	initialScope: ExtendAllScope;
	actions: WalletActions;
	balances: ChainRead<Balances>;
	onClose: () => void;
	onExtended: () => void;
}) {
	const ids = useId();
	const dialog = useRef<HTMLDivElement>(null);
	useModalFocus(dialog, onClose);
	const client = useCurrentClient();
	const [scope, setScope] = useState<ExtendAllScope>(initialScope);
	const [epochs, setEpochs] = useState(1);
	const [priceRead, setPriceRead] = useState(0);
	const [signing, setSigning] = useState<Signing>({ kind: "idle" });

	const expiring = useMemo(
		() => listed.rows.filter((row) => matchesFilter(row, "expiring")),
		[listed.rows],
	);
	const rows = scope === "expiring" ? expiring : viewRows;
	const price = useChainRead(`${network.id}:price-all:${priceRead}`, () =>
		readStoragePrice(client),
	).read;
	const pricePerUnit = price.status === "ready" ? price.data : null;
	const plan = useMemo(() => {
		if (pricePerUnit === null) return null;
		const soonestFirst = [...rows].sort(
			(a, b) => a.blob.endEpoch - b.blob.endEpoch,
		);
		const full = planExtend(
			soonestFirst,
			epochs,
			listed.clock,
			network.maxEpochsAhead,
			pricePerUnit,
		);
		const items = full.items.slice(0, MAX_EXTENDS_PER_TRANSACTION);
		return {
			...full,
			items,
			totalFrost: items.reduce((sum, item) => sum + item.frost, 0n),
			deferred: full.items.length - items.length,
		};
	}, [rows, epochs, listed.clock, network.maxEpochsAhead, pricePerUnit]);

	const gas = useChainRead(
		plan && plan.items.length > 0
			? `${network.id}:extend-all:${plan.items.map((item) => `${item.objectId}+${item.epochs}`).join(",")}:${pricePerUnit}`
			: null,
		(signal) =>
			plan === null || pricePerUnit === null
				? Promise.reject(new Error("The storage price is not read yet."))
				: simulateTransaction(
						client,
						buildExtendTransaction(client, plan.items, pricePerUnit),
						actions.address,
						signal,
					),
	).read;
	const gasMist = gas.status === "ready" ? gas.data.netMist : null;
	const wallet = balances.status === "ready" ? balances.data : null;
	const walAfter = wallet && plan ? wallet.wal - plan.totalFrost : null;
	const suiAfter = wallet && gasMist !== null ? wallet.sui - gasMist : null;
	const short =
		walAfter !== null && walAfter < 0n
			? "WAL"
			: suiAfter !== null && suiAfter < 0n
				? "SUI"
				: null;

	async function sign() {
		if (!plan || pricePerUnit === null) return;
		setSigning({ kind: "signing" });
		try {
			if ((await readStoragePrice(client)) !== pricePerUnit) {
				setPriceRead((value) => value + 1);
				setSigning({ kind: "price-changed" });
				return;
			}
			const executed = await actions.executor.execute(
				buildExtendTransaction(client, plan.items, pricePerUnit),
			);
			setSigning({
				kind: "done",
				digest: executed.digest,
				blobs: plan.items.length,
			});
			onExtended();
		} catch (error) {
			if (error instanceof PriceChangedError) {
				setPriceRead((value) => value + 1);
				setSigning({ kind: "price-changed" });
			} else
				setSigning({ kind: "failed", message: describeActionError(error) });
		}
	}

	const count = plan?.items.length ?? 0;
	return (
		<div className="scrim">
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${ids}-title`}
				ref={dialog}
			>
				<div className="l">
					<h2 id={`${ids}-title`}>Extend all</h2>
					<p>
						One transaction extends every blob below, so your wallet asks once.
						Nobody can pay for more than {network.maxEpochsAhead} epochs ahead
						of now, so a blob near that limit gets fewer epochs.
					</p>
					<fieldset>
						<legend>
							<h4>Which blobs</h4>
						</legend>
						<div className="keep">
							<label className={scope === "expiring" ? "on" : undefined}>
								<input
									type="radio"
									name={`${ids}-scope`}
									checked={scope === "expiring"}
									onChange={() => setScope("expiring")}
								/>
								Expiring within 30 days ({expiring.length})
							</label>
							<label className={scope === "view" ? "on" : undefined}>
								<input
									type="radio"
									name={`${ids}-scope`}
									checked={scope === "view"}
									onChange={() => setScope("view")}
								/>
								Listed in {viewLabel} ({viewRows.length})
							</label>
						</div>
					</fieldset>
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
							{network.epochDays === 1 ? "1 day" : `${network.epochDays} days`}{" "}
							on {network.label}.
						</span>
					</div>
				</div>
				<div className="r">
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
							<dt>Storage (WAL)</dt>
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
					{plan && plan.skipped.length > 0 ? (
						<p className="note">
							{plan.skipped.length === 1
								? "1 blob is left out"
								: `${plan.skipped.length} blobs are left out`}
							: not certified, expired, or already at the limit.
						</p>
					) : null}
					{plan && plan.deferred > 0 ? (
						<p className="note">
							{plan.deferred} more wait for a second run: one transaction holds{" "}
							{MAX_EXTENDS_PER_TRANSACTION} extends, soonest to expire first.
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
					{signing.kind === "price-changed" ? (
						<p className="note warn" role="alert">
							The storage price changed since this quote. Check the new cost and
							sign again.
						</p>
					) : signing.kind === "failed" ? (
						<p className="note warn" role="alert">
							{signing.message}
						</p>
					) : signing.kind === "done" ? (
						<p className="note" role="status">
							Extended{" "}
							{signing.blobs === 1 ? "1 blob" : `${signing.blobs} blobs`}.{" "}
							<a
								href={explorerTxUrl(network, signing.digest)}
								target="_blank"
								rel="noopener noreferrer"
							>
								View transaction
							</a>
						</p>
					) : null}
					<div className="acts">
						<button
							className="btn btn-ultra"
							type="button"
							disabled={
								count === 0 ||
								short !== null ||
								gas.status !== "ready" ||
								signing.kind === "signing" ||
								signing.kind === "done"
							}
							aria-busy={signing.kind === "signing"}
							onClick={sign}
						>
							{signing.kind === "signing"
								? "Confirm in your wallet…"
								: `Extend ${count === 1 ? "1 blob" : `${count} blobs`} · sign once`}
						</button>
						<button className="btn btn-soft" type="button" onClick={onClose}>
							{signing.kind === "done" ? "Close" : "Cancel"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useId, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import type { EpochClock } from "@/blobs/epoch-clock";
import { TokenAmount } from "@/components/token-amount";
import type { Balances } from "@/funds/types";
import { formatShortDate } from "@/lib/format-date";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import {
	buildExtendTransaction,
	PriceChangedError,
	readStoragePrice,
	simulateTransaction,
} from "@/manage/blob-transactions";
import { extendFrost, extendHeadroom } from "@/manage/extend-rules";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";

type Signing =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "price-changed" }
	| { kind: "failed"; message: string }
	| { kind: "done"; digest: string; newEndEpoch: number };

/**
 * Extend one blob: epochs within the 53-epoch limit, the cost from the live
 * storage price, the network fee from simulating the exact transaction, and
 * the balances after. The price is read again when Extend is pressed; if it
 * moved, the new cost is shown before anything is signed.
 */
export function ExtendPanel({
	network,
	blob,
	clock,
	nowMs,
	actions,
	balances,
	onExtended,
}: {
	network: NetworkConfig;
	blob: BlobRecord;
	clock: EpochClock;
	nowMs: number;
	actions: WalletActions;
	balances: ChainRead<Balances>;
	onExtended: () => void;
}) {
	const ids = useId();
	const client = useCurrentClient();
	const headroom = extendHeadroom(
		blob.endEpoch,
		clock.epoch,
		network.maxEpochsAhead,
	);
	const [chosen, setChosen] = useState(1);
	// After an extend the headroom shrinks; the choice follows it down.
	const epochs = Math.min(chosen, headroom);
	const [priceRead, setPriceRead] = useState(0);
	const [signing, setSigning] = useState<Signing>({ kind: "idle" });

	const price = useChainRead(`${network.id}:price:${priceRead}`, () =>
		readStoragePrice(client),
	).read;
	const pricePerUnit = price.status === "ready" ? price.data : null;
	const gas = useChainRead(
		pricePerUnit === null
			? null
			: `${network.id}:${blob.objectId}:${epochs}:${pricePerUnit}`,
		(signal) =>
			pricePerUnit === null
				? Promise.reject(new Error("The storage price is not read yet."))
				: simulateTransaction(
						client,
						buildExtendTransaction(
							client,
							[{ objectId: blob.objectId, epochs }],
							pricePerUnit,
						),
						actions.address,
						signal,
					),
	).read;

	const frost =
		pricePerUnit === null
			? null
			: extendFrost(blob.encodedSize, epochs, pricePerUnit);
	const gasMist = gas.status === "ready" ? gas.data.netMist : null;
	const wallet = balances.status === "ready" ? balances.data : null;
	const walAfter = wallet && frost !== null ? wallet.wal - frost : null;
	const suiAfter = wallet && gasMist !== null ? wallet.sui - gasMist : null;
	const newEnd = blob.endEpoch + epochs;
	const newEndMs =
		clock.epochStartMs + (newEnd - clock.epoch) * clock.epochDurationMs;
	const short =
		walAfter !== null && walAfter < 0
			? "WAL"
			: suiAfter !== null && suiAfter < 0
				? "SUI"
				: null;

	function choose(value: number) {
		setChosen(Math.max(1, Math.min(headroom, Math.floor(value) || 1)));
		setSigning({ kind: "idle" });
	}

	async function extend() {
		if (pricePerUnit === null) return;
		setSigning({ kind: "signing" });
		try {
			const current = await readStoragePrice(client);
			if (current !== pricePerUnit) {
				setPriceRead((value) => value + 1);
				setSigning({ kind: "price-changed" });
				return;
			}
			const executed = await actions.executor.execute(
				buildExtendTransaction(
					client,
					[{ objectId: blob.objectId, epochs }],
					pricePerUnit,
				),
			);
			setSigning({
				kind: "done",
				digest: executed.digest,
				newEndEpoch: newEnd,
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

	return (
		<div className="panel">
			<div className="stepper">
				<label htmlFor={`${ids}-epochs`}>Extend by</label>
				<input
					id={`${ids}-epochs`}
					type="number"
					inputMode="numeric"
					min={1}
					max={headroom}
					value={epochs}
					onChange={(event) => choose(event.currentTarget.valueAsNumber)}
				/>
				<span>{epochs === 1 ? "epoch" : "epochs"}</span>
				<button
					className="btn sm"
					type="button"
					aria-pressed={epochs === headroom}
					onClick={() => choose(headroom)}
				>
					Max {headroom}
				</button>
			</div>
			<p className="hint">
				Up to {headroom} more {headroom === 1 ? "epoch" : "epochs"}: nobody can
				pay for more than {network.maxEpochsAhead} epochs ahead of now. An epoch
				is {network.epochDays === 1 ? "1 day" : `${network.epochDays} days`} on{" "}
				{network.label}.
			</p>
			<dl className="cost" aria-live="polite">
				<div>
					<dt>Storage, {epochs === 1 ? "1 epoch" : `${epochs} epochs`}</dt>
					<dd>
						{price.status === "error" ? (
							<span className="warn-text">price unavailable</span>
						) : (
							<>
								<TokenAmount raw={frost} context="detailed" /> WAL
							</>
						)}
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
					<dt>New end</dt>
					<dd>
						epoch {newEnd}, about {formatShortDate(newEndMs, nowMs)}
					</dd>
				</div>
				<div>
					<dt>WAL after</dt>
					<dd
						className={
							walAfter !== null && walAfter < 0 ? "warn-text" : undefined
						}
					>
						{walAfter !== null && walAfter < 0 ? (
							"not enough"
						) : (
							<TokenAmount raw={walAfter} context="detailed" />
						)}
					</dd>
				</div>
				<div>
					<dt>SUI after</dt>
					<dd
						className={
							suiAfter !== null && suiAfter < 0 ? "warn-text" : undefined
						}
					>
						{suiAfter !== null && suiAfter < 0 ? (
							"not enough"
						) : (
							<TokenAmount raw={suiAfter} context="detailed" />
						)}
					</dd>
				</div>
			</dl>
			{gas.status === "error" ? (
				<p className="note warn">{describeActionError(gas.error)}</p>
			) : null}
			{short ? (
				<p className="note warn">
					Your wallet does not have enough {short} for this extend.
				</p>
			) : null}
			<div className="acts">
				<button
					className="btn sm"
					type="button"
					disabled={
						frost === null ||
						short !== null ||
						gas.status !== "ready" ||
						signing.kind === "signing"
					}
					aria-busy={signing.kind === "signing"}
					onClick={extend}
				>
					{signing.kind === "signing" ? (
						"Confirm in your wallet…"
					) : (
						<>
							Extend {epochs === 1 ? "1 epoch" : `${epochs} epochs`} ·{" "}
							<TokenAmount raw={frost} context="compact" /> WAL
						</>
					)}
				</button>
			</div>
			<SigningNote signing={signing} network={network} />
		</div>
	);
}

function SigningNote({
	signing,
	network,
}: {
	signing: Signing;
	network: NetworkConfig;
}) {
	switch (signing.kind) {
		case "idle":
		case "signing":
			return null;
		case "price-changed":
			return (
				<p className="note warn" role="alert">
					The storage price changed since this quote. Check the new cost above
					and press Extend again.
				</p>
			);
		case "failed":
			return (
				<p className="note warn" role="alert">
					{signing.message}
				</p>
			);
		case "done":
			return (
				<p className="note ok" role="status">
					Extended. Storage now ends at epoch {signing.newEndEpoch}.{" "}
					<a
						href={explorerTxUrl(network, signing.digest)}
						target="_blank"
						rel="noopener noreferrer"
					>
						View transaction
					</a>
				</p>
			);
	}
}

import { useCurrentClient } from "@mysten/dapp-kit-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toBlobRows } from "@/blobs/blob-row";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { readCurrentRecords } from "@/blobs/read-blob-object";
import type { NetworkConfig } from "@/network/networks";
import {
	TransactionFailedError,
	TransactionUnconfirmedError,
} from "@/transfers/wallet-executor";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { describeActionError } from "./action-error";
import {
	type AutoExtendPlan,
	type AutoExtendSettings,
	planAutoExtend,
	proposalKey,
} from "./auto-extend";
import { autoExtendStore, useAutoExtendSettings } from "./auto-extend-store";
import { buildExtendTransaction, readStoragePrice } from "./blob-transactions";

/** How often an open, visible app re-reads the wallet's blobs while auto-extend is on. */
const CHECK_INTERVAL_MS = 15 * 60_000;

export type AutoExtendStatus =
	| { kind: "idle" }
	| { kind: "renewing"; blobs: number }
	| {
			kind: "renewed";
			blobs: number;
			frost: bigint;
			digest: string;
			atMs: number;
	  }
	| { kind: "failed"; message: string; atMs: number }
	/** Sent, but its result could not be read: counted against the cap to be safe. */
	| { kind: "unconfirmed"; digest: string; frost: bigint; atMs: number };

export interface AutoExtend {
	settings: AutoExtendSettings;
	update: (change: Partial<AutoExtendSettings>) => void;
	/** The next cycle's renewal at the last listed prices; `null` until blobs and prices are read. */
	plan: AutoExtendPlan | null;
	status: AutoExtendStatus;
	/** Runs a cycle now, from a click: also how a declined or failed renewal is retried. */
	renewNow: () => void;
}

interface AutoExtendInput {
	network: NetworkConfig;
	/** `null` when no wallet is connected: auto-extend never runs then. */
	actions: WalletActions | null;
	listed: ListedBlobs | null;
	storagePricePerUnit: bigint | null;
	/** Re-reads the wallet's blobs, so a new epoch shows; called on the timer. */
	refreshBlobs: () => void;
	/** After a renewal: blobs and balances read again. */
	onRenewed: () => void;
}

/**
 * Auto-extend for the active profile (PROTOCOL-NOTES section 9, option 1).
 * It runs only inside the open app: whenever the wallet's blobs are read,
 * and every 15 minutes while the tab is visible, it plans a renewal and, if
 * one is due, asks the wallet to sign one extend transaction. Each proposal
 * is asked once per session; a declined or failed one waits for Renew now.
 *
 * Right before it asks, the renewal is planned again against the due blobs
 * as chain holds them now and a freshly read price, so a listing that is
 * behind (just after a renewal, or in another tab) never renews a blob
 * twice. A cross-tab lock keeps two windows from planning at once, and what
 * a renewal spends is added to the stored total, also when it was sent but
 * could not be confirmed.
 * @returns `null` while no wallet is connected.
 */
export function useAutoExtend({
	network,
	actions,
	listed,
	storagePricePerUnit,
	refreshBlobs,
	onRenewed,
}: AutoExtendInput): AutoExtend | null {
	const client = useCurrentClient();
	const address = actions?.address ?? null;
	const store = useMemo(
		() => (address === null ? null : autoExtendStore(network.id, address)),
		[network.id, address],
	);
	const settings = useAutoExtendSettings(store);
	// Status belongs to one profile; another profile starts idle.
	const [statusOf, setStatusOf] = useState<{
		store: typeof store;
		status: AutoExtendStatus;
	}>({ store: null, status: { kind: "idle" } });
	const status: AutoExtendStatus =
		statusOf.store === store ? statusOf.status : { kind: "idle" };
	const asked = useRef(new Set<string>());
	const running = useRef(false);
	const latest = useRef({ actions, listed, onRenewed });
	useLayoutEffect(() => {
		latest.current = { actions, listed, onRenewed };
	});

	const plan = useMemo(
		() =>
			listed && storagePricePerUnit !== null
				? planAutoExtend({
						rows: listed.rows,
						clock: listed.clock,
						settings,
						storagePricePerUnit,
						maxEpochsAhead: network.maxEpochsAhead,
					})
				: null,
		[listed, storagePricePerUnit, settings, network.maxEpochsAhead],
	);

	const run = useCallback(
		async (fromClick: boolean) => {
			const { actions: wallet, listed: blobs } = latest.current;
			if (!store || !wallet || !blobs || running.current) return;
			running.current = true;
			const setStatus = (next: AutoExtendStatus) =>
				setStatusOf({ store, status: next });
			const cycle = async (): Promise<void> => {
				const price = await readStoragePrice(client);
				const listedPlan = planAutoExtend({
					rows: blobs.rows,
					clock: blobs.clock,
					settings: store.get(),
					storagePricePerUnit: price,
					maxEpochsAhead: network.maxEpochsAhead,
				});
				if (listedPlan.kind !== "renew") return;
				// The listing can be behind chain: plan again on the due blobs as they are now.
				const window = store.get().renewWithinEpochs;
				const due = blobs.rows
					.filter((row) => row.blob.endEpoch - blobs.clock.epoch <= window)
					.map((row) => row.blob.objectId);
				const current = toBlobRows(
					await readCurrentRecords(client, due),
					blobs.clock,
					Date.now(),
				);
				const fresh = planAutoExtend({
					rows: current,
					clock: blobs.clock,
					settings: store.get(),
					storagePricePerUnit: price,
					maxEpochsAhead: network.maxEpochsAhead,
				});
				if (fresh.kind !== "renew") return;
				const key = proposalKey(blobs.clock.epoch, fresh.items);
				if (!fromClick && asked.current.has(key)) return;
				asked.current.add(key);
				setStatus({ kind: "renewing", blobs: fresh.items.length });
				const count = (frost: bigint) => {
					const now = store.get();
					store.set({ ...now, spentFrost: now.spentFrost + frost });
				};
				let digest: string;
				try {
					digest = (
						await wallet.executor.execute(
							buildExtendTransaction(client, fresh.items, price),
						)
					).digest;
				} catch (error) {
					if (!(error instanceof TransactionUnconfirmedError)) throw error;
					try {
						digest = (await wallet.executor.confirm(error.digest)).digest;
					} catch (confirmError) {
						// It failed on chain: no WAL moved, so nothing is counted.
						if (confirmError instanceof TransactionFailedError)
							throw confirmError;
						count(fresh.totalFrost);
						setStatus({
							kind: "unconfirmed",
							digest: error.digest,
							frost: fresh.totalFrost,
							atMs: Date.now(),
						});
						latest.current.onRenewed();
						return;
					}
				}
				count(fresh.totalFrost);
				setStatus({
					kind: "renewed",
					blobs: fresh.items.length,
					frost: fresh.totalFrost,
					digest,
					atMs: Date.now(),
				});
				latest.current.onRenewed();
			};
			try {
				// One window plans and signs at a time; another skips this cycle.
				if (typeof navigator !== "undefined" && navigator.locks)
					await navigator.locks.request(
						`morse-uploader:auto-extend:${network.id}:${wallet.address}`,
						{ ifAvailable: true },
						async (lock) => {
							if (lock) await cycle();
						},
					);
				else await cycle();
			} catch (error) {
				setStatus({
					kind: "failed",
					message: describeActionError(error),
					atMs: Date.now(),
				});
			} finally {
				running.current = false;
			}
		},
		[client, store, network.id, network.maxEpochsAhead],
	);

	// A renewal is due: ask the wallet, but only while someone can see the app.
	useEffect(() => {
		if (plan?.kind === "renew" && document.visibilityState === "visible")
			void run(false);
	}, [plan, run]);

	useEffect(() => {
		if (!settings.enabled || store === null) return;
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") refreshBlobs();
		}, CHECK_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [settings.enabled, store, refreshBlobs]);

	const update = useCallback(
		(change: Partial<AutoExtendSettings>) => {
			if (store) store.set({ ...store.get(), ...change });
		},
		[store],
	);
	const renewNow = useCallback(() => void run(true), [run]);

	if (store === null) return null;
	return { settings, update, plan, status, renewNow };
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { TokenAmount } from "@/components/token-amount";
import type { Balances } from "@/funds/types";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatAgo } from "@/lib/format-date";
import type { ChainRead } from "@/lib/use-chain-read";
import { useNow } from "@/lib/use-now";
import { usePublishTargets } from "@/morse/use-publish-targets";
import type { NetworkConfig } from "@/network/networks";
import {
	hasBytes,
	type StagedRoot,
	stagedLibrary,
	stagedTotals,
} from "@/staging/staged-files";
import type { TrayNotice } from "@/staging/staging-tray";
import {
	checkPrice,
	type PriceCheck,
	type QuotedTerms,
	quoteTray,
	type TrayQuote,
	trayBatch,
} from "@/staging/tray-quote";
import type { StagingTray } from "@/staging/use-staging-tray";
import { useTrayPricing } from "@/staging/use-tray-pricing";
import type { TransferBatch } from "@/transfers/transfer-job";
import { blobAttributes } from "@/upload/upload-plan";
import { quoteGas } from "@/upload/upload-quote";
import { useRegisterGas } from "@/upload/use-upload-quote";
import { CostList } from "./cost-list";
import { PlanNotes } from "./plan-notes";
import { listText, signHelp } from "./sign-help";
import { TrayItems } from "./tray-items";
import { TraySettingsPanel } from "./tray-settings";

interface StagingTrayProps {
	network: NetworkConfig;
	/** The normalized address of the connected wallet, which signs. */
	owner: string;
	tray: StagingTray;
	balances: ChainRead<Balances>;
	/** The transfers slide-over is open: the tray steps aside on wide screens. */
	besidePanel: boolean;
	onSend: (batch: TransferBatch) => void;
}

type Sending =
	| { kind: "idle" }
	| { kind: "checking" }
	| { kind: "changed"; check: Extract<PriceCheck, { kind: "changed" }> }
	| { kind: "failed"; message: string };

/**
 * The staging tray (design/v2/app-staging.html, handover item 2): what is
 * staged, the four settings, the itemised price from the Walrus system
 * object and one button, Sign and send with the real signature count.
 * Nothing uploads until it is pressed. The prices are read when the tray
 * opens and again right before signing; if they changed, the tray shows
 * the new ones and asks again.
 */
export function StagingTrayPanel({
	network,
	owner,
	tray,
	balances,
	besidePanel,
	onSend,
}: StagingTrayProps) {
	const ids = useId();
	const { model, state } = tray;
	const { roots, settings } = state;
	const [collapsed, setCollapsed] = useState(false);
	// Each opening is a new session, so the prices are read again.
	const [session, setSession] = useState(0);
	const [sending, setSending] = useState<Sending>({ kind: "idle" });
	const check = useRef<AbortController | null>(null);
	useEffect(() => () => check.current?.abort(), []);

	const pricing = useTrayPricing(network, session);
	const priced = pricing.read.status === "ready" ? pricing.read : null;
	const targets = usePublishTargets(
		network.id,
		settings.publish ? owner : null,
	);
	const targetList = targets.read.status === "ready" ? targets.read.data : null;
	const library = useMemo(() => stagedLibrary(roots), [roots]);
	const quote = useMemo(
		() =>
			priced
				? quoteTray({
						library,
						settings,
						inputs: priced.data,
						network,
						pricedAtMs: priced.readAt.getTime(),
						publishTargets: targetList,
					})
				: null,
		[priced, library, settings, network, targetList],
	);
	const terms = quote?.quote ?? null;
	const gas = useRegisterGas(
		network,
		quote && terms && quote.epochs !== null
			? {
					owner,
					epochs: quote.epochs,
					deletable: settings.deletable,
					items: quote.plan.items.map((item, index) => ({
						attributes: blobAttributes(item),
						tipMaxMist: terms.tipMaxMist[index] ?? 0,
					})),
				}
			: null,
	);
	const registerMist =
		gas.status === "ready" &&
		terms &&
		gas.data.length === terms.signatures.items
			? gas.data
			: null;
	const gasMist =
		terms && registerMist
			? quoteGas(terms, registerMist, network.observedGas)
			: null;

	const wallet = balances.status === "ready" ? balances.data : null;
	const walAfter = terms && wallet ? wallet.wal - terms.cost.walFrost : null;
	const suiAfter =
		terms && wallet ? wallet.sui - terms.cost.tipMist - (gasMist ?? 0n) : null;
	const short =
		walAfter !== null && walAfter < 0n
			? "WAL"
			: suiAfter !== null && suiAfter < 0n
				? "SUI"
				: null;

	const totals = stagedTotals(roots);
	const lost = roots.filter((root) => !hasBytes(root));
	const blocked = blockedBecause(quote, lost, settings.publish, targets.read);
	const canSend =
		quote !== null &&
		terms !== null &&
		blocked === null &&
		short === null &&
		sending.kind !== "checking";
	const now = useNow(30_000);

	async function signAndSend() {
		if (!canSend || !quote) return;
		check.current?.abort();
		const controller = new AbortController();
		check.current = controller;
		setSending({ kind: "checking" });
		try {
			const { inputs, readAt } = await pricing.reread(controller.signal);
			const fresh = quoteTray({
				library,
				settings,
				inputs,
				network,
				pricedAtMs: readAt.getTime(),
				publishTargets: targetList,
			});
			const price = checkPrice(quote, fresh);
			if (price.kind === "changed") {
				setSending({ kind: "changed", check: price });
				return;
			}
			const batch = trayBatch({
				tray: fresh,
				network,
				owner,
				deletable: settings.deletable,
				registerMist,
			});
			if (!batch) throw new Error("Nothing staged can go up as it is.");
			setSending({ kind: "idle" });
			onSend(batch);
		} catch (error) {
			if (controller.signal.aborted) return;
			setSending({
				kind: "failed",
				message: `Could not read the prices again, so nothing was signed: ${errorMessage(error)}`,
			});
		}
	}

	function toggle() {
		// Opening the tray again reads the prices again.
		if (collapsed) setSession((value) => value + 1);
		setCollapsed((value) => !value);
	}

	const notice = noticeText(state.notice);
	const signatures = terms?.signatureTotal ?? null;
	const classes = [
		"tray",
		collapsed ? "folded" : null,
		besidePanel ? "beside" : null,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<section
			className={classes}
			aria-labelledby={`${ids}-title`}
			data-tray
			data-saved={state.saved}
		>
			<div className="hd">
				<h3 id={`${ids}-title`}>Staged for upload</h3>
				<span className="count">
					{totals.items} {totals.items === 1 ? "item" : "items"} ·{" "}
					{formatBytes(BigInt(totals.bytes))}
				</span>
				<button
					className="fold"
					type="button"
					aria-expanded={!collapsed}
					aria-controls={`${ids}-body`}
					aria-label={collapsed ? "Show staged files" : "Hide staged files"}
					onClick={toggle}
				>
					<Icon name="chevron" size={12} />
				</button>
			</div>
			{collapsed ? null : (
				<>
					<div className="body" id={`${ids}-body`}>
						<TrayItems
							roots={roots}
							plan={quote?.plan ?? null}
							folders={quote?.sealing ? "per-file" : settings.mode}
							sealing={quote?.sealing ?? false}
							onRemove={(root) => model.remove(root.id)}
						/>
						{quote ? (
							<div className="notes">
								<PlanNotes plan={quote.plan} />
							</div>
						) : null}
						{notice ? <p className="tnote warn">{notice}</p> : null}
						{pricing.read.status === "error" ? (
							<p className="tnote problem" role="alert">
								Could not read Walrus prices: {errorMessage(pricing.read.error)}{" "}
								<button
									className="btn text sm"
									type="button"
									onClick={() => setSession((value) => value + 1)}
								>
									Try again
								</button>
							</p>
						) : null}
						<TraySettingsPanel
							network={network}
							settings={settings}
							tray={quote}
							clock={priced?.data.clock ?? null}
							pricedAtMs={priced?.readAt.getTime() ?? null}
							sealAvailable={
								network.seal.kind === "available" && priced?.data.seal != null
							}
							publishTargets={targets.read}
							onRetryPublishTargets={targets.refresh}
							onChange={(change) => {
								setSending({ kind: "idle" });
								model.update(change);
							}}
						/>
						<div className="costs">
							<CostList
								quote={terms}
								gasMist={gasMist}
								plan={quote?.plan ?? null}
								epochs={quote?.epochs ?? null}
								keepLabel={keepLabel(quote)}
								gas={gas}
							/>
							{gas.status === "error" ? (
								<p className="note warn">
									Network fees could not be simulated:{" "}
									{errorMessage(gas.error).replace(/\.$/, "")}. A wallet that
									cannot pay fails this simulation too; your wallet shows its
									fee before you sign.
								</p>
							) : null}
						</div>
					</div>
					<div className="ft">
						<small className="price" aria-live="polite">
							{priceLine(
								priced?.readAt ?? null,
								now,
								walAfter,
								suiAfter,
								short,
							)}
						</small>
						<button
							className="btn primary"
							type="button"
							disabled={!canSend}
							onClick={signAndSend}
						>
							{sending.kind === "checking"
								? "Checking the price…"
								: signatures === null
									? "Sign and send"
									: `Sign and send · ${signatures} ${signatures === 1 ? "signature" : "signatures"}`}
						</button>
						<button
							className="btn sm"
							type="button"
							onClick={() => model.clear()}
						>
							Clear
						</button>
						<small className="help">
							{signHelp(terms?.signatures ?? null)}
						</small>
						{sending.kind === "changed" ? (
							<p className="tnote warn" role="alert">
								{changedText(sending.check.before, sending.check.after)}
							</p>
						) : null}
						{sending.kind === "failed" ? (
							<p className="tnote problem" role="alert">
								{sending.message}
							</p>
						) : null}
						{blocked ? <p className="tnote">{blocked}</p> : null}
					</div>
				</>
			)}
			<p className="sr-only" role="status">
				{totals.items} {totals.items === 1 ? "item" : "items"} staged for
				upload.
			</p>
		</section>
	);
}

/** Why Sign and send is off, apart from funds (the price line says that). */
function blockedBecause(
	quote: TrayQuote | null,
	lost: readonly StagedRoot[],
	publish: boolean,
	targets: ChainRead<unknown>,
): string | null {
	if (lost.length > 0) {
		const one = lost.length === 1;
		return `${listText(lost.map(rootLabel))} came back without ${one ? "its" : "their"} bytes after the reload. Drop or pick ${one ? "it" : "them"} again, or remove ${one ? "it" : "them"}.`;
	}
	if (!quote) return "Reading prices from the Walrus system object…";
	if (quote.plan.problems.length > 0)
		return "Fix what the notes above say to send.";
	if (quote.plan.items.length === 0)
		return "Nothing staged can go up as it is.";
	if (quote.epochs === null)
		return "The chosen period needs more epochs than Walrus stores ahead right now. Choose another under Keep for.";
	if (publish && quote.blocker === null && quote.choice === null)
		return targets.status === "ready" || targets.status === "error"
			? "Choose a publication and collection under Also publish, or turn it off."
			: "Reading your Morse publications…";
	return null;
}

function rootLabel(root: StagedRoot): string {
	return root.kind === "folder" ? `${root.name}/` : root.name;
}

function keepLabel(quote: TrayQuote | null): string | null {
	const keep = quote?.keep;
	if (keep?.kind !== "period") return null;
	return quote?.periods.find((period) => period.id === keep.id)?.label ?? null;
}

function priceLine(
	readAt: Date | null,
	now: number,
	walAfter: bigint | null,
	suiAfter: bigint | null,
	short: "WAL" | "SUI" | null,
) {
	if (short)
		return (
			<span className="warn-text">
				Not enough {short} for this upload. Top up from the balance menu, or
				remove something.
			</span>
		);
	if (!readAt)
		return "Price read from the Walrus system object when the tray opens.";
	const read = `Price read from the Walrus system object ${formatAgo(readAt.getTime(), now)}`;
	if (walAfter === null || suiAfter === null) return `${read}.`;
	return (
		<>
			{read} · balance after <TokenAmount raw={walAfter} context="compact" />{" "}
			WAL, <TokenAmount raw={suiAfter} context="compact" /> SUI
		</>
	);
}

function changedText(before: QuotedTerms, after: QuotedTerms) {
	const changes: string[] = [];
	if (before.walFrost !== after.walFrost) changes.push("the WAL total");
	if (before.tipMist !== after.tipMist) changes.push("the relay tip");
	if (before.epochs !== after.epochs)
		changes.push(
			`the period (now ${after.epochs ?? "none"} ${after.epochs === 1 ? "epoch" : "epochs"})`,
		);
	if (before.signatures !== after.signatures)
		changes.push("the signature count");
	return `The price changed since the tray opened: ${listText(changes)}. The tray shows the new price; check it and press Sign and send again. Nothing was signed.`;
}

function noticeText(notice: TrayNotice | null): string | null {
	switch (notice?.kind) {
		case undefined:
			return null;
		case "memory-only":
			return "This browser keeps no data for this site, so the tray empties when the tab closes.";
		case "list-only":
			return `The list is saved, but not the newest files' bytes: ${notice.reason}. They upload from this tab; after a reload, add them again.`;
		case "load-failed":
			return `The saved tray could not be read back: ${notice.message}`;
		case "save-failed":
			return `The tray could not be saved for a reload: ${notice.message}`;
	}
}

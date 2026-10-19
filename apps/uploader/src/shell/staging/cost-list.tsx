import { TokenAmount } from "@/components/token-amount";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import type { ChainRead } from "@/lib/use-chain-read";
import type { UploadPlan } from "@/upload/upload-plan";
import type { Quote } from "@/upload/upload-quote";

/**
 * The itemised cost of an upload from live prices (PROTOCOL-NOTES section
 * 13, items 2 and 7): the encoded size with its fixed metadata, storage for
 * the period, the write fee, the relay tip, the network fees for every
 * transaction, and the total.
 */
export function CostList({
	quote,
	gasMist,
	plan,
	epochs,
	keepLabel,
	gas,
}: {
	quote: Quote | null;
	gasMist: bigint | null;
	plan: UploadPlan | null;
	epochs: number | null;
	keepLabel: string | null;
	gas: ChainRead<bigint[]>;
}) {
	if (!quote || !plan || epochs === null)
		return <div className="cost skel" aria-busy="true" />;
	const transactions = quote.signatureTotal;
	const period = `${keepLabel ? `${keepLabel}, ` : ""}${epochs} ${epochs === 1 ? "epoch" : "epochs"}`;
	return (
		<dl className="cost">
			<div>
				<dt>Encoded size</dt>
				<dd>
					{formatBytes(BigInt(plan.contentBytes))} →{" "}
					{formatBytes(quote.cost.encodedSize)}
				</dd>
			</div>
			<p className="note">Each blob carries 64 MB of fixed metadata.</p>
			<div>
				<dt>Storage, {period}</dt>
				<dd>
					<TokenAmount raw={quote.cost.storageFrost} context="detailed" /> WAL
				</dd>
			</div>
			<div>
				<dt>Write fee</dt>
				<dd>
					<TokenAmount raw={quote.cost.writeFrost} context="detailed" /> WAL
				</dd>
			</div>
			<div>
				<dt>Relay tip (SUI)</dt>
				<dd>
					<TokenAmount raw={quote.cost.tipMist} context="detailed" /> SUI
				</dd>
			</div>
			<div>
				<dt>
					Network fees (SUI), {transactions}{" "}
					{transactions === 1 ? "transaction" : "transactions"}
				</dt>
				<dd
					title={gas.status === "error" ? errorMessage(gas.error) : undefined}
				>
					{gasMist !== null ? (
						<>
							≈ <TokenAmount raw={gasMist} context="detailed" /> SUI
						</>
					) : gas.status === "error" ? (
						<span className="warn-text">could not estimate</span>
					) : (
						<span className="muted">estimating…</span>
					)}
				</dd>
			</div>
			<div className="tot">
				<dt>Total</dt>
				<dd>
					<TokenAmount raw={quote.cost.walFrost} context="compact" /> WAL +{" "}
					{gasMist !== null ? (
						<TokenAmount raw={quote.cost.tipMist + gasMist} context="compact" />
					) : (
						<TokenAmount raw={quote.cost.tipMist} context="compact" />
					)}{" "}
					SUI{gasMist === null ? " + fees" : ""}
				</dd>
			</div>
		</dl>
	);
}

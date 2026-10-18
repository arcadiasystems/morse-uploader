import { useId, useState } from "react";
import { TokenAmount } from "@/components/token-amount";
import { TOKEN_DECIMALS } from "@/funds/types";
import { formatAgo } from "@/lib/format-date";
import { parseDecimalAmount } from "@/lib/parse-decimal-amount";
import { toDecimalString } from "@/lib/to-decimal-string";
import {
	type AutoExtendPlan,
	EXTEND_BY_RANGE,
	RENEW_WITHIN_RANGE,
} from "@/manage/auto-extend";
import type { AutoExtend, AutoExtendStatus } from "@/manage/use-auto-extend";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import { SwitchRow } from "../switch-row";

/** Whether the shown blob is one auto-extend renews, or the setting is shown for the profile. */
export type AutoExtendReach = "this-blob" | "not-this-blob" | "profile";

/**
 * The profile's auto-extend setting (PROTOCOL-NOTES section 9 and section
 * 13, item 13). The copy states the limitation plainly: it runs only while
 * the app is open, asks for a signature each time and stops at the cap.
 */
export function AutoExtendPanel({
	network,
	autoExtend,
	covers,
}: {
	network: NetworkConfig;
	autoExtend: AutoExtend;
	/**
	 * Which blobs the line under the setting talks about: the inspector's
	 * blob, which auto-extend renews or not, or the whole profile.
	 */
	covers: AutoExtendReach;
}) {
	const ids = useId();
	const { settings, update, plan, status, renewNow } = autoExtend;
	const epochWord =
		network.epochDays === 1 ? "1 day" : `${network.epochDays} days`;
	const extendByRange = {
		min: EXTEND_BY_RANGE.min,
		max: network.maxEpochsAhead,
	};

	return (
		<SwitchRow
			title="Auto-extend"
			checked={settings.enabled}
			onChange={(enabled) => update({ enabled })}
			extra={
				settings.enabled ? (
					<div className="panel">
						<div className="stepper">
							<label htmlFor={`${ids}-cap`}>WAL cap</label>
							<CommitInput
								id={`${ids}-cap`}
								inputMode="decimal"
								value={toDecimalString(settings.capFrost, TOKEN_DECIMALS)}
								parse={(text) => parseDecimalAmount(text, TOKEN_DECIMALS)}
								onCommit={(capFrost) => update({ capFrost })}
								invalidText="Type the cap as a number of WAL, such as 0.05."
							/>
							<span>WAL in total</span>
						</div>
						<div className="stepper">
							<label htmlFor={`${ids}-within`}>Renew at</label>
							<CommitInput
								id={`${ids}-within`}
								inputMode="numeric"
								value={String(settings.renewWithinEpochs)}
								parse={(text) => epochCount(text, RENEW_WITHIN_RANGE)}
								onCommit={(renewWithinEpochs) => update({ renewWithinEpochs })}
								invalidText={`Renew at ${RENEW_WITHIN_RANGE.min} to ${RENEW_WITHIN_RANGE.max} epochs left.`}
							/>
							<span>epochs left, adding</span>
							<CommitInput
								id={`${ids}-by`}
								label="Epochs each renewal adds"
								inputMode="numeric"
								value={String(settings.extendByEpochs)}
								parse={(text) => epochCount(text, extendByRange)}
								onCommit={(extendByEpochs) => update({ extendByEpochs })}
								invalidText={`Add ${extendByRange.min} to ${extendByRange.max} epochs.`}
							/>
							<span>epochs</span>
						</div>
						<p className="hint">
							Changes apply when you leave a field. An epoch is {epochWord} on{" "}
							{network.label}. Spent so far:{" "}
							<TokenAmount raw={settings.spentFrost} context="detailed" /> of{" "}
							<TokenAmount raw={settings.capFrost} context="detailed" /> WAL.{" "}
							{settings.spentFrost > 0n ? (
								<button
									className="cp"
									type="button"
									onClick={() => update({ spentFrost: 0n })}
								>
									Start counting again
								</button>
							) : null}
						</p>
						<PlanLine plan={plan} covers={covers} />
						<StatusLine
							status={status}
							network={network}
							onRenewNow={renewNow}
						/>
					</div>
				) : null
			}
		>
			Auto-extend runs while Morse Uploader is open. It asks your wallet to sign
			one transaction for all blobs that are close to expiry and never spends
			more than your WAL cap. Nothing renews while the app is closed, and a blob
			that reaches its end epoch can no longer be extended.
		</SwitchRow>
	);
}

/**
 * A setting typed as text and applied when the field is left or Enter is
 * pressed, so a half-typed cap never starts a renewal.
 */
function CommitInput<T>({
	id,
	label,
	inputMode,
	value,
	parse,
	onCommit,
	invalidText,
}: {
	id: string;
	label?: string;
	inputMode: "decimal" | "numeric";
	value: string;
	parse: (text: string) => T | null;
	onCommit: (value: T) => void;
	invalidText: string;
}) {
	const [text, setText] = useState<string | null>(null);
	const shown = text ?? value;
	const invalid = text !== null && parse(text) === null;

	function commit() {
		if (text === null) return;
		const parsed = parse(text);
		if (parsed === null) return;
		onCommit(parsed);
		setText(null);
	}

	return (
		<>
			<input
				id={id}
				type="text"
				inputMode={inputMode}
				aria-label={label}
				aria-invalid={invalid}
				title={invalid ? invalidText : undefined}
				value={shown}
				onChange={(event) => setText(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") commit();
				}}
			/>
			{invalid ? (
				<span className="note warn" role="alert">
					{invalidText}
				</span>
			) : null}
		</>
	);
}

function epochCount(
	text: string,
	range: { min: number; max: number },
): number | null {
	if (!/^\d{1,3}$/.test(text.trim())) return null;
	const value = Number(text.trim());
	return value >= range.min && value <= range.max ? value : null;
}

const SCOPE_TEXT: Readonly<Record<AutoExtendReach, string>> = {
	"this-blob":
		"It covers this blob and every other certified blob of this profile.",
	"not-this-blob":
		"It covers this profile's certified, unexpired blobs; this one is not among them.",
	profile: "It covers every certified, unexpired blob of this profile.",
};

function PlanLine({
	plan,
	covers,
}: {
	plan: AutoExtendPlan | null;
	covers: AutoExtendReach;
}) {
	const scope = SCOPE_TEXT[covers];
	if (plan === null) return <p className="note">{scope}</p>;
	switch (plan.kind) {
		case "off":
		case "nothing-due":
			return <p className="note">{scope} Nothing is due right now.</p>;
		case "cap-reached":
			return (
				<p className="note warn">
					{plan.due === 1 ? "1 blob is" : `${plan.due} blobs are`} due, but the
					cap has <TokenAmount raw={plan.remainingFrost} context="detailed" />{" "}
					WAL left, not enough for a renewal. Raise the cap to renew.
				</p>
			);
		case "renew":
			return (
				<p className="note">
					Due now:{" "}
					{plan.items.length === 1 ? "1 blob" : `${plan.items.length} blobs`}{" "}
					for <TokenAmount raw={plan.totalFrost} context="detailed" /> WAL
					{plan.leftOut > 0
						? `; ${plan.leftOut} more wait for a higher cap`
						: ""}
					.
				</p>
			);
	}
}

function StatusLine({
	status,
	network,
	onRenewNow,
}: {
	status: AutoExtendStatus;
	network: NetworkConfig;
	onRenewNow: () => void;
}) {
	switch (status.kind) {
		case "idle":
			return null;
		case "renewing":
			return (
				<p className="note" role="status">
					Asking your wallet to renew{" "}
					{status.blobs === 1 ? "1 blob" : `${status.blobs} blobs`}…
				</p>
			);
		case "renewed":
			return (
				<p className="note ok" role="status">
					Renewed {status.blobs === 1 ? "1 blob" : `${status.blobs} blobs`} for{" "}
					<TokenAmount raw={status.frost} context="detailed" /> WAL,{" "}
					{formatAgo(status.atMs, Date.now())}.{" "}
					<a
						href={explorerTxUrl(network, status.digest)}
						target="_blank"
						rel="noopener noreferrer"
					>
						View transaction
					</a>
				</p>
			);
		case "unconfirmed":
			return (
				<p className="note warn" role="alert">
					A renewal for <TokenAmount raw={status.frost} context="detailed" />{" "}
					WAL was sent, but its result could not be read. It is counted against
					your cap until you see it on chain.{" "}
					<a
						href={explorerTxUrl(network, status.digest)}
						target="_blank"
						rel="noopener noreferrer"
					>
						Check the transaction
					</a>
				</p>
			);
		case "failed":
			return (
				<div className="note warn" role="alert">
					The last renewal did not go through: {status.message}{" "}
					<button className="cp" type="button" onClick={onRenewNow}>
						Renew now
					</button>
				</div>
			);
	}
}

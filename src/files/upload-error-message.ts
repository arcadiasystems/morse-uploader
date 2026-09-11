import {
	type FormattedError,
	formatUserMessage,
} from "@arcadiasystems/morse-sdk";

/**
 * Render an upload failure for the UI. Defers to the SDK's `formatUserMessage`
 * except for an insufficient-balance failure, which the SDK sees only as a
 * transport error carrying `@mysten/sui`'s raw text: a coin type, an address,
 * and two unscaled integers. That reads as a network problem when it is really
 * "top up the wallet", so it is rewritten here with the amounts in whole coins
 * and the network's way of getting more.
 */
export function uploadErrorMessage(
	error: unknown,
	network?: "testnet" | "mainnet",
): FormattedError {
	const shortfall = parseInsufficientBalance(errorText(error));
	if (shortfall === null) {
		return formatUserMessage(error);
	}
	return {
		title: `Not enough ${shortfall.symbol}`,
		description: describe(shortfall, network),
		cause: error,
	};
}

interface Shortfall {
	readonly symbol: string;
	readonly decimals: number | null;
	readonly required: bigint;
	readonly available: bigint;
}

// @mysten/sui's CoinWithBalance intent, thrown while resolving the coins the
// transaction spends: "Insufficient balance of <coinType> for owner <address>.
// Required: <n>, Available: <n>".
const INSUFFICIENT_RE =
	/Insufficient balance of (\S+) for owner \S+?\.\s*Required:\s*(\d+),\s*Available:\s*(\d+)/;

function parseInsufficientBalance(text: string): Shortfall | null {
	const match = INSUFFICIENT_RE.exec(text);
	if (match === null) {
		return null;
	}
	const [, coinType, required, available] = match;
	return {
		...coin(coinType as string),
		required: BigInt(required as string),
		available: BigInt(available as string),
	};
}

/**
 * Both coins Walrus charges use 9 decimals. Anything else is reported in raw
 * units rather than scaled by a guessed exponent.
 */
function coin(coinType: string): { symbol: string; decimals: number | null } {
	if (coinType.endsWith("::wal::WAL")) {
		return { symbol: "WAL", decimals: 9 };
	}
	if (coinType.endsWith("::sui::SUI")) {
		return { symbol: "SUI", decimals: 9 };
	}
	const symbol = coinType.split("::").pop();
	return { symbol: symbol ?? "coins", decimals: null };
}

function describe(shortfall: Shortfall, network?: string): string {
	const need = amount(shortfall.required, shortfall.decimals, shortfall.symbol);
	const have = amount(
		shortfall.available,
		shortfall.decimals,
		shortfall.symbol,
	);
	return `This upload needs ${need} and the connected wallet has ${have}. ${topUp(shortfall.symbol, network)}`;
}

function topUp(symbol: string, network?: string): string {
	if (network === "testnet") {
		return symbol === "WAL"
			? "Swap some testnet SUI for WAL at https://stake-wal.wal.app/?network=testnet, then retry."
			: "Get testnet SUI from https://faucet.sui.io/, then retry.";
	}
	if (network === "mainnet") {
		return `There is no faucet on mainnet, so ${symbol} has to be acquired (Walrus charges WAL for storage and SUI for gas). Top up the wallet, then retry.`;
	}
	return `Top up the wallet with ${symbol}, then retry.`;
}

function amount(
	value: bigint,
	decimals: number | null,
	symbol: string,
): string {
	if (decimals === null) {
		return `${value.toString()} ${symbol}`;
	}
	const scale = 10n ** BigInt(decimals);
	const whole = value / scale;
	const fraction = (value % scale).toString().padStart(decimals, "0");
	const trimmed = fraction.replace(/0+$/, "");
	const text = trimmed === "" ? whole.toString() : `${whole}.${trimmed}`;
	return `${text} ${symbol}`;
}

/** Flatten the error and its causes, since the text can sit on either. */
function errorText(error: unknown): string {
	const parts: string[] = [];
	let current = error;
	for (
		let depth = 0;
		current !== null && current !== undefined && depth < 5;
		depth += 1
	) {
		if (current instanceof Error) {
			parts.push(current.message);
			current = current.cause;
			continue;
		}
		parts.push(String(current));
		break;
	}
	return parts.join(" | ");
}

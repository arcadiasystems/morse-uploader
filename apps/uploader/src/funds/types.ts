/** Raw balances: WAL in FROST, SUI in MIST (both 9 decimals). */
export interface Balances {
	wal: bigint;
	sui: bigint;
}

/** Live prices from the Walrus system object, in FROST. */
export interface WalrusPrices {
	/** Per 1 MiB of encoded size per epoch. */
	storagePerUnit: bigint;
	/** Per 1 MiB of encoded size, charged once when a blob is registered. */
	writePerUnit: bigint;
	/** Storage plus write fee for the smallest blob (1 byte) for one epoch. */
	smallestUpload: bigint;
}

/** The minimum balances one upload needs on a network. */
export interface FundsFloor {
	walFrost: bigint;
	suiMist: bigint;
}

export interface FundsAssessment {
	walLow: boolean;
	suiLow: boolean;
	/** Either balance is below its floor: the wallet cannot pay for one upload. */
	low: boolean;
}

export const TOKEN_DECIMALS = 9;

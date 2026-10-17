import { decodeSuiPrivateKey, type Keypair } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import type { Page } from "@playwright/test";
import { registerTestWallet } from "./register-test-wallet";

/**
 * The test-only Wallet Standard wallet. It is registered in the page by
 * Playwright and never imported by app code, so it is never bundled. Keys
 * stay in this Node process; the page only sees addresses and public keys.
 */
export const TEST_WALLET_NAME = "Morse E2E Wallet";
export const KEY_ENV = "E2E_SUI_PRIVATE_KEY";

const FULLNODES: Record<
	string,
	{ network: "testnet" | "mainnet"; baseUrl: string }
> = {
	"sui:testnet": {
		network: "testnet",
		baseUrl: "https://fullnode.testnet.sui.io:443",
	},
	"sui:mainnet": {
		network: "mainnet",
		baseUrl: "https://fullnode.mainnet.sui.io:443",
	},
};

type WalletRequest =
	| { kind: "connect" }
	| { kind: "disconnect" }
	| { kind: "signPersonalMessage"; address: string; message: string }
	| {
			kind: "signTransaction";
			address: string;
			chain: string;
			transaction: string;
	  };

export interface TestWallet {
	/** How many times the app asked the wallet to connect. */
	connects: () => number;
	/** How many times the app disconnected the wallet. */
	disconnects: () => number;
}

/** The funded test key from E2E_SUI_PRIVATE_KEY, or `null` when it is not set. */
export function keypairFromEnv(): Keypair | null {
	const secret = process.env[KEY_ENV];
	if (!secret) return null;
	let scheme: string;
	try {
		scheme = decodeSuiPrivateKey(secret).scheme;
	} catch {
		// Never surface the decoder's message: it could echo part of the secret.
		throw new Error(`${KEY_ENV} is not a valid suiprivkey string.`);
	}
	switch (scheme) {
		case "ED25519":
			return Ed25519Keypair.fromSecretKey(secret);
		case "Secp256k1":
			return Secp256k1Keypair.fromSecretKey(secret);
		case "Secp256r1":
			return Secp256r1Keypair.fromSecretKey(secret);
		default:
			throw new Error(
				`${KEY_ENV} uses the ${scheme} scheme, which the test wallet does not support.`,
			);
	}
}

/** Registers the test wallet with these accounts in every page the test opens. */
export async function installTestWallet(
	page: Page,
	keypairs: readonly Keypair[],
): Promise<TestWallet> {
	const byAddress = new Map(
		keypairs.map((keypair) => [keypair.toSuiAddress(), keypair]),
	);
	let connects = 0;
	let disconnects = 0;

	await page.exposeFunction(
		"__morseE2eWalletBridge",
		async (request: WalletRequest) => {
			switch (request.kind) {
				case "connect":
					connects += 1;
					return null;
				case "disconnect":
					disconnects += 1;
					return null;
				case "signPersonalMessage":
					return signerFor(byAddress, request.address).signPersonalMessage(
						fromBase64(request.message),
					);
				case "signTransaction": {
					const fullnode = FULLNODES[request.chain];
					if (!fullnode)
						throw new Error(
							`The test wallet does not know chain ${request.chain}.`,
						);
					const client = new SuiGrpcClient(fullnode);
					const bytes = await Transaction.from(request.transaction).build({
						client,
					});
					return signerFor(byAddress, request.address).signTransaction(bytes);
				}
			}
		},
	);

	await page.addInitScript(registerTestWallet, {
		name: TEST_WALLET_NAME,
		bridge: "__morseE2eWalletBridge",
		authorizedKey: "morse-e2e-wallet:authorized",
		chains: Object.keys(FULLNODES),
		accounts: keypairs.map((keypair) => ({
			address: keypair.toSuiAddress(),
			publicKey: toBase64(keypair.getPublicKey().toSuiBytes()),
		})),
	});

	return { connects: () => connects, disconnects: () => disconnects };
}

function signerFor(byAddress: Map<string, Keypair>, address: string): Keypair {
	const keypair = byAddress.get(address);
	if (!keypair) throw new Error(`The test wallet has no account ${address}.`);
	return keypair;
}

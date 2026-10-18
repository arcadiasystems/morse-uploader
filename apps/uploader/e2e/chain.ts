/**
 * Reads chain state for assertions over Sui GraphQL, a different transport
 * from the app's gRPC client, so balances and blobs are checked
 * independently. Constants come from design/PROTOCOL-NOTES.md.
 */
export type Network = "testnet" | "mainnet";

const WALRUS_SYSTEM_OBJECT: Record<Network, string> = {
	testnet: "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af",
	mainnet: "0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2",
};

const WALRUS_STAKING_OBJECT: Record<Network, string> = {
	testnet: "0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3",
	mainnet: "0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904",
};

const AGGREGATOR: Record<Network, string> = {
	testnet: "https://aggregator.walrus-testnet.walrus.space",
	mainnet: "https://aggregator.walrus-mainnet.walrus.space",
};

export const SUI_COIN_TYPE = "0x2::sui::SUI";
export const MAINNET_WAL_COIN_TYPE =
	"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL";

async function graphql<T>(
	network: Network,
	query: string,
	variables: Record<string, string | null>,
): Promise<T> {
	const response = await fetch(`https://graphql.${network}.sui.io/graphql`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});
	if (!response.ok)
		throw new Error(`Sui GraphQL ${network} answered ${response.status}.`);
	const body = (await response.json()) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (body.errors?.length || !body.data) {
		throw new Error(
			`Sui GraphQL ${network}: ${body.errors?.map((error) => error.message).join("; ")}`,
		);
	}
	return body.data;
}

/** The Walrus type package: the package of the System object's type. */
async function walrusTypePackage(network: Network): Promise<string> {
	const system = await graphql<{
		object: { asMoveObject: { contents: { type: { repr: string } } } };
	}>(
		network,
		"query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { type { repr } } } } }",
		{ id: WALRUS_SYSTEM_OBJECT[network] },
	);
	return system.object.asMoveObject.contents.type.repr.split("::")[0] ?? "";
}

/** The WAL coin type from `staking::stake_with_pool` in the package of the Walrus System type. */
export async function walCoinType(network: Network): Promise<string> {
	const packageId = await walrusTypePackage(network);
	const fn = await graphql<{
		package: { module: { function: { parameters: { repr: string }[] } } };
	}>(
		network,
		'query($p: SuiAddress!) { package(address: $p) { module(name: "staking") { function(name: "stake_with_pool") { parameters { repr } } } } }',
		{ p: packageId },
	);
	const coin = fn.package.module.function.parameters[1]?.repr ?? "";
	const match = /::coin::Coin<(.+)>$/.exec(coin);
	if (!match?.[1])
		throw new Error(`Unexpected stake_with_pool signature: ${coin}`);
	return match[1];
}

/** The owner's total balance of a coin type, in raw units. */
export async function balance(
	network: Network,
	owner: string,
	coinType: string,
): Promise<bigint> {
	const data = await graphql<{
		address: { balance: { totalBalance: string } | null } | null;
	}>(
		network,
		"query($owner: SuiAddress!, $t: String!) { address(address: $owner) { balance(coinType: $t) { totalBalance } } }",
		{ owner, t: coinType },
	);
	return BigInt(data.address?.balance?.totalBalance ?? "0");
}

/** A raw 9-decimal amount as the exact decimal string, without grouping. */
export function decimal(raw: bigint): string {
	const whole = raw / 1_000_000_000n;
	const fraction = (raw % 1_000_000_000n)
		.toString()
		.padStart(9, "0")
		.replace(/0+$/, "");
	return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** One owned Walrus Blob object, as GraphQL's JSON shows it. */
export interface ChainBlob {
	objectId: string;
	/** URL-safe base64, converted here from the u256 without the SDK. */
	blobId: string;
	size: bigint;
	/** The encoded size storage is billed on. */
	encodedSize: bigint;
	certifiedEpoch: number | null;
	startEpoch: number;
	endEpoch: number;
	deletable: boolean;
	attributes: Record<string, string>;
}

interface BlobJson {
	blob_id: string;
	size: string;
	certified_epoch: number | null;
	deletable: boolean;
	storage: { start_epoch: number; end_epoch: number; storage_size: string };
}

/** u256 little-endian to URL-safe base64 without padding (PROTOCOL-NOTES section 7). */
export function blobIdFromDecimal(decimalId: string): string {
	let value = BigInt(decimalId);
	const bytes = Buffer.alloc(32);
	for (let index = 0; index < 32; index += 1) {
		bytes[index] = Number(value & 0xffn);
		value >>= 8n;
	}
	return bytes.toString("base64url");
}

/**
 * Every Blob object the owner holds, paged 50 at a time with the attributes
 * in the same request: the listing query from PROTOCOL-NOTES section 7.
 */
export async function ownedBlobs(
	network: Network,
	owner: string,
): Promise<ChainBlob[]> {
	const type = `${await walrusTypePackage(network)}::blob::Blob`;
	const blobs: ChainBlob[] = [];
	let after: string | null = null;
	do {
		const data: {
			address: {
				objects: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: {
						address: string;
						contents: { json: BlobJson };
						dynamicField: {
							value: {
								json: {
									metadata: { contents: { key: string; value: string }[] };
								};
							};
						} | null;
					}[];
				};
			} | null;
		} = await graphql(
			network,
			`query($owner: SuiAddress!, $type: String!, $after: String) {
				address(address: $owner) {
					objects(filter: { type: $type }, first: 50, after: $after) {
						pageInfo { hasNextPage endCursor }
						nodes {
							address
							contents { json }
							dynamicField(name: { type: "vector<u8>", bcs: "CG1ldGFkYXRh" }) {
								value { ... on MoveValue { json } }
							}
						}
					}
				}
			}`,
			{ owner, type, after },
		);
		const page = data.address?.objects;
		if (!page) break;
		for (const node of page.nodes) {
			const json = node.contents.json;
			blobs.push({
				objectId: node.address,
				blobId: blobIdFromDecimal(json.blob_id),
				size: BigInt(json.size),
				encodedSize: BigInt(json.storage.storage_size),
				certifiedEpoch: json.certified_epoch,
				startEpoch: json.storage.start_epoch,
				endEpoch: json.storage.end_epoch,
				deletable: json.deletable,
				attributes: Object.fromEntries(
					(node.dynamicField?.value.json.metadata.contents ?? []).map(
						({ key, value }) => [key, value],
					),
				),
			});
		}
		after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
	} while (after !== null);
	return blobs;
}

/** The current Walrus epoch and its timing, from the staking object's inner field. */
export async function walrusEpoch(
	network: Network,
): Promise<{ epoch: number; epochStartMs: number; epochDurationMs: number }> {
	const staking = await graphql<{
		object: { asMoveObject: { contents: { json: { version: string } } } };
	}>(
		network,
		"query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }",
		{ id: WALRUS_STAKING_OBJECT[network] },
	);
	const version = Buffer.alloc(8);
	version.writeBigUInt64LE(
		BigInt(staking.object.asMoveObject.contents.json.version),
	);
	const inner = await graphql<{
		object: {
			dynamicField: {
				value: {
					json: {
						epoch: number;
						epoch_duration: string;
						epoch_state: Record<string, string | number>;
					};
				};
			};
		};
	}>(
		network,
		'query($id: SuiAddress!, $name: Base64!) { object(address: $id) { dynamicField(name: { type: "u64", bcs: $name }) { value { ... on MoveValue { json } } } } }',
		{ id: WALRUS_STAKING_OBJECT[network], name: version.toString("base64") },
	);
	const { epoch, epoch_duration, epoch_state } =
		inner.object.dynamicField.value.json;
	const started = epoch_state.pos0;
	return {
		epoch,
		epochDurationMs: Number(epoch_duration),
		// EpochChangeSync carries a weight, not a time: the epoch began just now.
		epochStartMs:
			epoch_state["@variant"] === "EpochChangeSync"
				? Date.now()
				: Number(started),
	};
}

/** A quilt's patch identifiers as the aggregator lists them, a source independent of the app's SDK reads. */
export async function quiltPatchIdentifiers(
	network: Network,
	quiltBlobId: string,
): Promise<string[]> {
	const response = await fetch(
		`${AGGREGATOR[network]}/v1/quilts/${quiltBlobId}/patches`,
	);
	if (!response.ok)
		throw new Error(
			`The aggregator answered ${response.status} for quilt ${quiltBlobId}.`,
		);
	const patches = (await response.json()) as { identifier: string }[];
	return patches.map((patch) => patch.identifier);
}

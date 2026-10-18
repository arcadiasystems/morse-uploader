/**
 * Reads chain state for assertions over Sui GraphQL, a different transport
 * from the app's gRPC client, so balances are checked independently.
 * Constants come from design/PROTOCOL-NOTES.md.
 */
export type Network = "testnet" | "mainnet";

const WALRUS_SYSTEM_OBJECT: Record<Network, string> = {
	testnet: "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af",
	mainnet: "0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2",
};

export const SUI_COIN_TYPE = "0x2::sui::SUI";
export const MAINNET_WAL_COIN_TYPE =
	"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL";

async function graphql<T>(
	network: Network,
	query: string,
	variables: Record<string, string>,
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

/** The WAL coin type from `staking::stake_with_pool` in the package of the Walrus System type. */
export async function walCoinType(network: Network): Promise<string> {
	const system = await graphql<{
		object: { asMoveObject: { contents: { type: { repr: string } } } };
	}>(
		network,
		"query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { type { repr } } } } }",
		{ id: WALRUS_SYSTEM_OBJECT[network] },
	);
	const packageId =
		system.object.asMoveObject.contents.type.repr.split("::")[0] ?? "";
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

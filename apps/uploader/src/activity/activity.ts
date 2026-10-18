import { normalizeSuiAddress } from "@mysten/sui/utils";

/**
 * The wallet's recent Walrus and Morse transactions, for the Overview's
 * recent activity. Sui GraphQL lists what an address sent; each transaction
 * is recognised by the Move function it called and checked against the
 * objects it changed, whose types carry the Walrus and Morse packages' type
 * origins, so another package's `system::register_blob` is not mistaken for
 * Walrus's.
 */

/** One sent transaction, as far as the activity feed needs it. */
export interface SentTransaction {
	digest: string;
	timestampMs: number;
	succeeded: boolean;
	/** Move calls in order, by module and function. */
	calls: readonly { module: string; fn: string }[];
	/** Objects the transaction created, changed or deleted, with their Move type. */
	changed: readonly { objectId: string; type: string | null }[];
	/** Events it emitted. */
	events: readonly { type: string; json: Readonly<Record<string, unknown>> }[];
}

/** The type strings that tie a change to Walrus or Morse. */
export interface ActivityTypes {
	blob: string;
	publication: string | null;
	recipientFile: string | null;
}

export type ActivityKind =
	| "register"
	| "certify"
	| "extend"
	| "delete"
	| "burn"
	| "publish"
	| "encrypt"
	| "share"
	| "unshare";

export interface ActivityItem {
	digest: string;
	timestampMs: number;
	succeeded: boolean;
	kind: ActivityKind;
	/** Walrus Blob objects it changed. */
	blobObjectIds: readonly string[];
	/** Morse publications it changed. */
	publicationIds: readonly string[];
	/** The RecipientFile it created or changed, and its name when an event carries it. */
	file: { id: string; name: string | null } | null;
	/** The address a recipient change added or removed. */
	recipient: string | null;
}

/** Which call makes a transaction which kind, most telling first, and the object it must change. */
const RULES: readonly {
	kind: ActivityKind;
	module: string;
	fn: (name: string) => boolean;
	touches: keyof ActivityTypes;
}[] = [
	{ kind: "delete", module: "system", fn: is("delete_blob"), touches: "blob" },
	{ kind: "burn", module: "blob", fn: is("burn"), touches: "blob" },
	{
		kind: "certify",
		module: "system",
		fn: is("certify_blob"),
		touches: "blob",
	},
	{
		kind: "register",
		module: "system",
		fn: is("register_blob"),
		touches: "blob",
	},
	{
		kind: "extend",
		module: "system",
		fn: (name) => name.startsWith("extend_blob"),
		touches: "blob",
	},
	{
		kind: "publish",
		module: "publication",
		fn: (name) =>
			name.startsWith("add_entry") || name.startsWith("add_revision"),
		touches: "publication",
	},
	{
		kind: "encrypt",
		module: "recipient_file",
		fn: (name) => name.startsWith("new_recipient_file"),
		touches: "recipientFile",
	},
	{
		kind: "share",
		module: "recipient_file",
		fn: is("add_recipient"),
		touches: "recipientFile",
	},
	{
		kind: "unshare",
		module: "recipient_file",
		fn: is("remove_recipient"),
		touches: "recipientFile",
	},
];

/** A Move type with its package address in full form, so short and long spellings compare equal. */
function typeKey(type: string): string {
	const separator = type.indexOf("::");
	if (separator === -1) return type;
	return `${normalizeSuiAddress(type.slice(0, separator))}${type.slice(separator)}`;
}

function is(expected: string): (name: string) => boolean {
	return (name) => name === expected;
}

/** What a transaction did, or `null` when it is not a Walrus or Morse action. */
export function classifyTransaction(
	transaction: SentTransaction,
	types: ActivityTypes,
): ActivityItem | null {
	const typed = (key: keyof ActivityTypes) => {
		const type = types[key];
		if (type === null) return [];
		const wanted = typeKey(type);
		return transaction.changed
			.filter(
				(change) => change.type !== null && typeKey(change.type) === wanted,
			)
			.map((change) => change.objectId);
	};
	const rule = RULES.find(
		(candidate) =>
			transaction.calls.some(
				(call) => call.module === candidate.module && candidate.fn(call.fn),
			) && typed(candidate.touches).length > 0,
	);
	if (!rule) return null;
	const [fileId] = typed("recipientFile");
	const fileEvent = transaction.events.find(
		(event) => typeof event.json.file === "string",
	);
	const name = fileEvent?.json.name;
	const recipient = fileEvent?.json.recipient;
	return {
		digest: transaction.digest,
		timestampMs: transaction.timestampMs,
		succeeded: transaction.succeeded,
		kind: rule.kind,
		blobObjectIds: typed("blob"),
		publicationIds: typed("publication"),
		file:
			fileId === undefined
				? null
				: { id: fileId, name: typeof name === "string" ? name : null },
		recipient:
			typeof recipient === "string" ? normalizeSuiAddress(recipient) : null,
	};
}

/**
 * One page of the sent-transactions query, newest first.
 * @throws {Error} When the shape is unexpected.
 */
export function parseTransactionsPage(data: unknown): SentTransaction[] {
	const nodes = (
		data as {
			transactions?: { nodes?: readonly TransactionNode[] };
		} | null
	)?.transactions?.nodes;
	if (!nodes) throw new Error("Sui GraphQL returned no transactions page.");
	return nodes
		.flatMap((node): SentTransaction[] => {
			const timestampMs =
				typeof node.effects?.timestamp === "string"
					? Date.parse(node.effects.timestamp)
					: Number.NaN;
			if (typeof node.digest !== "string" || Number.isNaN(timestampMs))
				return [];
			return [
				{
					digest: node.digest,
					timestampMs,
					succeeded: node.effects?.status === "SUCCESS",
					calls: (node.kind?.commands?.nodes ?? []).flatMap((command) => {
						const fn = command.function;
						return typeof fn?.name === "string" &&
							typeof fn.module?.name === "string"
							? [{ module: fn.module.name, fn: fn.name }]
							: [];
					}),
					changed: (node.effects?.objectChanges?.nodes ?? []).flatMap(
						(change) => {
							if (typeof change.address !== "string") return [];
							const type = (change.outputState ?? change.inputState)
								?.asMoveObject?.contents?.type?.repr;
							return [
								{
									objectId: change.address,
									type: typeof type === "string" ? type : null,
								},
							];
						},
					),
					events: (node.effects?.events?.nodes ?? []).flatMap((event) => {
						const type = event.contents?.type?.repr;
						const json = event.contents?.json;
						return typeof type === "string" &&
							typeof json === "object" &&
							json !== null
							? [{ type, json: json as Record<string, unknown> }]
							: [];
					}),
				},
			];
		})
		.reverse();
}

interface TransactionNode {
	digest?: unknown;
	effects?: {
		status?: unknown;
		timestamp?: unknown;
		objectChanges?: {
			nodes?: readonly {
				address?: unknown;
				inputState?: ObjectState | null;
				outputState?: ObjectState | null;
			}[];
		};
		events?: {
			nodes?: readonly {
				contents?: { type?: { repr?: unknown }; json?: unknown };
			}[];
		};
	};
	kind?: {
		commands?: {
			nodes?: readonly {
				function?: { name?: unknown; module?: { name?: unknown } };
			}[];
		};
	};
}

interface ObjectState {
	asMoveObject?: { contents?: { type?: { repr?: unknown } } } | null;
}

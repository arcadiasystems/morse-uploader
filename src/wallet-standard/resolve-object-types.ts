import type { ObjectReader } from "@arcadiasystems/morse-sdk";

/**
 * Resolve the Move type of each object id via `getObject`, returning an
 * `id -> type` map. Ids that cannot be read are omitted (best effort). Used to
 * backfill created-object types the transaction receipt did not include, which
 * happens when the executing client (e.g. a wallet's fullnode) and the reading
 * client (the SDK's gRPC client) are different endpoints.
 */
export async function resolveObjectTypes(
	client: ObjectReader,
	ids: readonly string[],
	signal?: AbortSignal,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const objectId of ids) {
		try {
			const response = await client.getObject({
				objectId,
				...(signal === undefined ? {} : { signal }),
			});
			out[objectId] = response.object.type;
		} catch {
			// Skip ids that cannot be resolved; findCreatedId surfaces the rest.
		}
	}
	return out;
}

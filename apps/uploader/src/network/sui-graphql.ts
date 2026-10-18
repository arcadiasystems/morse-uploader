/**
 * One query against Sui GraphQL, for what gRPC does not offer: event and
 * transaction queries by sender. The service answers with CORS `*`.
 * @returns The response's `data`, for the caller to validate.
 * @throws {Error} When the service answers with an HTTP error or GraphQL errors.
 */
export async function querySuiGraphql(
	graphqlUrl: string,
	query: string,
	variables: Readonly<Record<string, unknown>>,
	signal: AbortSignal,
): Promise<unknown> {
	const response = await fetch(graphqlUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
		signal,
	});
	if (!response.ok) throw new Error(`Sui GraphQL answered ${response.status}.`);
	return graphqlData(await response.json());
}

/**
 * The `data` of a GraphQL response body.
 * @throws {Error} When the body reports errors or carries no data.
 */
export function graphqlData(body: unknown): unknown {
	const root = body as {
		data?: unknown;
		errors?: readonly { message?: unknown }[];
	} | null;
	if (root?.errors?.length)
		throw new Error(
			`Sui GraphQL: ${root.errors.map((error) => String(error.message)).join("; ")}`,
		);
	if (root?.data === undefined || root.data === null)
		throw new Error("Sui GraphQL returned no data.");
	return root.data;
}

/** A readable message for anything thrown by a wallet, the chain or the browser. */
export function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim() !== "")
		return error.message;
	if (typeof error === "string" && error.trim() !== "") return error;
	return "Something went wrong. Try again.";
}

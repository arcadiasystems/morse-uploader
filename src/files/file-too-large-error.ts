import { formatBytes } from "../utils/format-bytes.js";
import type { FileTooLargeErrorArgs, UploadSizeLimit } from "./types.js";

/**
 * The file is too large to upload through the Walrus upload relay without a
 * tip above `sendTip.max`. Raised by {@link useFileUpload} before the file is
 * read, encrypted, encoded or signed for, or, when only Seal's envelope takes
 * it over, after encryption and before encoding. Render it with
 * {@link uploadErrorMessage}, or narrow on it and read `limit`.
 */
export class FileTooLargeError extends Error {
	readonly sizeBytes: number;
	readonly afterEncryption: boolean;
	readonly limit: UploadSizeLimit;

	constructor(args: FileTooLargeErrorArgs) {
		const subject = args.afterEncryption
			? "Encrypted, this file is"
			: "This file is";
		super(
			`${subject} ${describeBytes(args.sizeBytes)}, over the ${describeBytes(args.limit.maxBytes)} limit for one upload. The Walrus upload relay's tip grows with file size, and this app caps it at ${args.limit.maxTipMist.toLocaleString("en-US")} MIST.`,
		);
		this.name = "FileTooLargeError";
		this.sizeBytes = args.sizeBytes;
		this.afterEncryption = args.afterEncryption;
		this.limit = args.limit;
	}
}

function describeBytes(bytes: number): string {
	return `${formatBytes(bytes)} (${bytes.toLocaleString("en-US")} bytes)`;
}

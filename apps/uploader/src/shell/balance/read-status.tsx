import { errorMessage } from "@/lib/error-message";
import type { ChainRead } from "@/lib/use-chain-read";

/** One line saying when a chain read happened, or why it did not. */
export function ReadStatus<T>({
	read,
	subject,
}: {
	read: ChainRead<T>;
	subject: string;
}) {
	switch (read.status) {
		case "idle":
			return null;
		case "loading":
			return <p className="note">Reading {subject} from chain…</p>;
		case "ready":
			return (
				<p className="note">
					{read.refreshing ? "Refreshing… " : ""}Read from chain at{" "}
					<time dateTime={read.readAt.toISOString()}>
						{read.readAt.toLocaleTimeString()}
					</time>
					.
				</p>
			);
		case "error":
			return (
				<p className="problem" role="alert">
					Could not read {subject}: {errorMessage(read.error)}
				</p>
			);
	}
}

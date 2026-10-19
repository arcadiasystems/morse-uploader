import { errorMessage } from "@/lib/error-message";
import type { ChainRead } from "@/lib/use-chain-read";
import type { PublishTarget } from "@/morse/read-publish-targets";
import {
	choiceKey,
	choiceLabel,
	type PublishChoice,
} from "@/upload/publish-rules";

/** The publication and collection an upload's entries go into, from what the wallet can write to. */
export function PublishPicker({
	read,
	choices,
	choice,
	onChoose,
	onRetry,
	mode,
}: {
	read: ChainRead<PublishTarget[]>;
	choices: readonly PublishChoice[];
	choice: PublishChoice | null;
	onChoose: (key: string) => void;
	onRetry: () => void;
	mode: "blob" | "quilt" | null;
}) {
	if (read.status === "error")
		return (
			<p className="problem">
				Could not read your Morse publications: {errorMessage(read.error)}{" "}
				<button className="btn text sm" type="button" onClick={onRetry}>
					Try again
				</button>
			</p>
		);
	if (read.status !== "ready")
		return <p className="note">Reading your Morse publications…</p>;
	if (choices.length === 0)
		return (
			<p className="note">
				This wallet holds no publisher cap for a publication with a{" "}
				{mode ?? "blob"} collection.
			</p>
		);
	return (
		<label className="pick">
			<span className="sr-only">Publication and collection</span>
			<select
				value={choice ? choiceKey(choice) : ""}
				onChange={(event) => onChoose(event.currentTarget.value)}
			>
				{choices.map((option) => (
					<option key={choiceKey(option)} value={choiceKey(option)}>
						{choiceLabel(option, choices)}
					</option>
				))}
			</select>
		</label>
	);
}

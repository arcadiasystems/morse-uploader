import { useId, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { usePublishTargets } from "@/morse/use-publish-targets";
import type { NetworkConfig } from "@/network/networks";
import { choiceKey, choiceLabel, publishChoices } from "@/upload/publish-rules";

/** The publications and collections of one mode the wallet can write to, and the picked one. */
export function useCollectionChoice(
	network: NetworkConfig,
	owner: string,
	mode: "blob" | "quilt",
) {
	const targets = usePublishTargets(network.id, owner);
	const choices =
		targets.read.status === "ready"
			? publishChoices(targets.read.data, mode)
			: [];
	const [choiceId, setChoiceId] = useState<string | null>(null);
	const choice =
		choices.find((option) => choiceKey(option) === choiceId) ??
		choices[0] ??
		null;
	return { targets, choices, choice, setChoiceId };
}

/** The picker, or why there is nothing to pick. */
export function CollectionPicker({
	network,
	mode,
	state,
	onPick,
}: {
	network: NetworkConfig;
	mode: "blob" | "quilt";
	state: ReturnType<typeof useCollectionChoice>;
	onPick: () => void;
}) {
	const ids = useId();
	const { targets, choices, choice, setChoiceId } = state;
	if (targets.read.status === "loading" || targets.read.status === "idle")
		return (
			<span className="note" role="status">
				Reading the publications this wallet can publish to…
			</span>
		);
	if (targets.read.status === "error")
		return (
			<span className="note warn" role="alert">
				Could not read your publications: {errorMessage(targets.read.error)}{" "}
				<button className="cp" type="button" onClick={targets.refresh}>
					Try again
				</button>
			</span>
		);
	if (choices.length === 0)
		return (
			<span className="note">
				This wallet holds no PublisherCap for a {mode} collection on{" "}
				{network.label}. A {mode} collection takes{" "}
				{mode === "quilt" ? "files from quilts" : "standalone blobs"}.
			</span>
		);
	return (
		<>
			<label className="sr-only" htmlFor={`${ids}-target`}>
				Publication and collection
			</label>
			<select
				id={`${ids}-target`}
				value={choice ? choiceKey(choice) : ""}
				onChange={(event) => {
					setChoiceId(event.currentTarget.value);
					onPick();
				}}
			>
				{choices.map((option) => (
					<option key={choiceKey(option)} value={choiceKey(option)}>
						{choiceLabel(option, choices)}
					</option>
				))}
			</select>
		</>
	);
}

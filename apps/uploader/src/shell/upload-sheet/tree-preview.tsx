import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { IDENTIFIER_PROBLEM_TEXT } from "@/upload/quilt-identifier";
import {
	type PlanItem,
	type PlanProblem,
	RELAY_MAX_UPLOAD_BYTES,
	type UploadPlan,
} from "@/upload/upload-plan";

/** Lines shown per quilt before the rest is summed up. */
const QUILT_LINES = 5;

/** "What goes up": each blob and quilt the upload creates, and what stops or is left out. */
export function TreePreview({ plan }: { plan: UploadPlan }) {
	return (
		<>
			<ul className="tree" aria-label="What goes up">
				{plan.items.map((item) => (
					<li key={item.key}>
						<b>{item.kind === "quilt" ? `${item.name}/` : item.name}</b>{" "}
						<span className="to">{itemSummary(item)}</span>
						{item.kind === "quilt" ? <QuiltLines item={item} /> : null}
					</li>
				))}
			</ul>
			{plan.leftOut.length > 0 ? (
				<div className="note warn">
					<b>
						{plan.leftOut.length === 1
							? "1 file is left out"
							: `${groupThousands(String(plan.leftOut.length))} files are left out`}{" "}
						of the quilt
					</b>
					<ul className="leftout">
						{plan.leftOut.slice(0, QUILT_LINES).map((file) => (
							<li key={file.file.id}>
								<code>
									{file.quiltName}/{file.identifier}
								</code>
								: {IDENTIFIER_PROBLEM_TEXT[file.problem]}.
							</li>
						))}
						{plan.leftOut.length > QUILT_LINES ? (
							<li>and {plan.leftOut.length - QUILT_LINES} more.</li>
						) : null}
					</ul>
					Choose one blob per file to upload them as they are.
				</div>
			) : null}
			{plan.problems.map((problem) => (
				<p
					className="problem"
					role="alert"
					key={`${problem.kind}:${problem.name}`}
				>
					{problemText(problem)}
				</p>
			))}
		</>
	);
}

function itemSummary(item: PlanItem): string {
	if (item.kind === "quilt") {
		const files = item.patches.length;
		return `→ 1 quilt, ${groupThousands(String(files))} ${files === 1 ? "file" : "files"}, paths kept`;
	}
	return `→ 1 ${item.seal ? "encrypted blob" : "blob"}, ${formatBytes(BigInt(item.contentBytes))}`;
}

/** A quilt's top level: files, and folders with how many files they hold. */
function QuiltLines({ item }: { item: Extract<PlanItem, { kind: "quilt" }> }) {
	const groups = new Map<string, number>();
	for (const patch of item.patches) {
		const slash = patch.identifier.indexOf("/");
		const top =
			slash === -1 ? patch.identifier : `${patch.identifier.slice(0, slash)}/`;
		groups.set(top, (groups.get(top) ?? 0) + 1);
	}
	const lines = [...groups];
	const shown = lines.slice(0, QUILT_LINES);
	const rest = lines.length - shown.length;
	return (
		<ul>
			{shown.map(([name, files], index) => (
				<li key={name}>
					<span aria-hidden="true">
						{index === shown.length - 1 && rest === 0 ? "└ " : "├ "}
					</span>
					{name}
					{name.endsWith("/") ? (
						<span className="muted">
							{" "}
							({groupThousands(String(files))} {files === 1 ? "file" : "files"})
						</span>
					) : null}
				</li>
			))}
			{rest > 0 ? (
				<li>
					<span aria-hidden="true">└ </span>
					<span className="muted">and {groupThousands(String(rest))} more</span>
				</li>
			) : null}
		</ul>
	);
}

function problemText(problem: PlanProblem): string {
	switch (problem.kind) {
		case "too-large":
			return `${problem.name} would send ${formatBytes(BigInt(problem.bytes))}; the upload relay takes at most ${formatBytes(BigInt(RELAY_MAX_UPLOAD_BYTES))} (1 GiB) per upload. Leave it out or split it.`;
		case "too-many-files":
			return `${problem.name}/ has ${groupThousands(String(problem.files))} files; a quilt holds at most ${problem.limit}. Choose one blob per file or split the folder.`;
		case "nothing-left":
			return `No file in ${problem.name}/ can go in a quilt. Choose one blob per file.`;
	}
}

import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import type { PlanItem, UploadPlan } from "@/upload/upload-plan";
import { PlanNotes } from "../staging/plan-notes";

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
			<PlanNotes plan={plan} />
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

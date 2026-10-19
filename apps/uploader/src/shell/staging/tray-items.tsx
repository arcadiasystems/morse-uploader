import { useId, useState } from "react";
import { fileIcon } from "@/components/file-icon";
import { Icon, type IconName } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { pathInFolder } from "@/local/local-library";
import { hasBytes, type StagedRoot } from "@/staging/staged-files";
import type { UploadPlan } from "@/upload/upload-plan";

/** Paths listed under an open folder before the rest is summed up. */
const TREE_LINES = 12;

interface TrayItemsProps {
	roots: readonly StagedRoot[];
	/** `null` until the prices are read; only then is a quilt's left-out count known. */
	plan: UploadPlan | null;
	/** How folders upload now: Seal always uploads one blob per file. */
	folders: "quilt" | "per-file";
	sealing: boolean;
	onRemove: (root: StagedRoot) => void;
}

/** The staged items (design/v2/app-staging.html): each folder or file, what it becomes, and a folder's paths. */
export function TrayItems({
	roots,
	plan,
	folders,
	sealing,
	onRemove,
}: TrayItemsProps) {
	return (
		<ul className="its" aria-label="Staged items">
			{roots.map((root) => (
				<TrayItem
					key={root.id}
					root={root}
					summary={summaryOf(root, plan, folders, sealing)}
					icon={iconOf(root, folders, sealing)}
					onRemove={() => onRemove(root)}
				/>
			))}
		</ul>
	);
}

function TrayItem({
	root,
	summary,
	icon,
	onRemove,
}: {
	root: StagedRoot;
	summary: { text: string; warn: boolean };
	icon: { name: IconName; tone: "lift" | "dim" | "warn" };
	onRemove: () => void;
}) {
	const treeId = useId();
	const [open, setOpen] = useState(false);
	const folder = root.kind === "folder";
	const label = folder ? `${root.name}/` : root.name;
	const bytes = root.files.reduce((total, file) => total + file.size, 0);
	return (
		<li data-staged={root.name}>
			<div className="it">
				<span className={`ic ${icon.tone}`} aria-hidden="true">
					<Icon name={icon.name} />
				</span>
				<span className="nm">
					{folder ? (
						<button
							className="tw"
							type="button"
							aria-expanded={open}
							aria-controls={treeId}
							onClick={() => setOpen((value) => !value)}
						>
							<span className={open ? "chev on" : "chev"} aria-hidden="true">
								<Icon name="chevron" size={10} />
							</span>
							<span className="name" title={label}>
								{label}
							</span>
						</button>
					) : (
						<span className="name" title={label}>
							{label}
						</span>
					)}
					<small className={summary.warn ? "warn" : undefined}>
						{summary.text}
					</small>
				</span>
				<span className="sz">{formatBytes(BigInt(bytes))}</span>
				<button
					className="x"
					type="button"
					aria-label={`Remove ${label}`}
					onClick={onRemove}
				>
					<Icon name="close" size={12} />
				</button>
			</div>
			{folder && open ? <FolderTree id={treeId} root={root} /> : null}
		</li>
	);
}

/** A folder's files by their path inside it: the paths a quilt keeps. */
function FolderTree({ id, root }: { id: string; root: StagedRoot }) {
	const shown = root.files.slice(0, TREE_LINES);
	const rest = root.files.length - shown.length;
	return (
		<ul className="paths" id={id} aria-label={`Files in ${root.name}`}>
			{shown.map((file, index) => (
				<li key={file.id}>
					<span aria-hidden="true">
						{index === shown.length - 1 && rest === 0 ? "└" : "├"}
					</span>
					<span className="path" title={pathInFolder(file)}>
						{pathInFolder(file)}
					</span>
					<span className="sz">{formatBytes(BigInt(file.size))}</span>
				</li>
			))}
			{rest > 0 ? (
				<li>
					<span aria-hidden="true">└</span>
					<span className="path muted">
						and {groupThousands(String(rest))} more
					</span>
				</li>
			) : null}
		</ul>
	);
}

function summaryOf(
	root: StagedRoot,
	plan: UploadPlan | null,
	folders: "quilt" | "per-file",
	sealing: boolean,
): { text: string; warn: boolean } {
	if (!hasBytes(root))
		return {
			text: "Not kept after the reload · add it again",
			warn: true,
		};
	const count = root.files.length;
	const blob = sealing ? "encrypted blob" : "blob";
	if (root.kind === "file") return { text: `1 ${blob}`, warn: false };
	const files = `${groupThousands(String(count))} ${count === 1 ? "file" : "files"}`;
	if (folders === "per-file")
		return {
			text: `${files} → ${groupThousands(String(count))} ${count === 1 ? blob : `${blob}s`}`,
			warn: false,
		};
	const leftOut =
		plan?.leftOut.filter((left) => left.file.id.startsWith(`${root.id}:`))
			.length ?? 0;
	return {
		text: `${files} → 1 quilt, paths kept${leftOut > 0 ? ` · ${groupThousands(String(leftOut))} left out` : ""}`,
		warn: leftOut > 0,
	};
}

function iconOf(
	root: StagedRoot,
	folders: "quilt" | "per-file",
	sealing: boolean,
): { name: IconName; tone: "lift" | "dim" | "warn" } {
	if (!hasBytes(root)) return { name: "alert", tone: "warn" };
	if (sealing) return { name: "lock", tone: "lift" };
	if (root.kind === "folder")
		return folders === "quilt"
			? { name: "quilt", tone: "lift" }
			: { name: "folder", tone: "dim" };
	return { name: fileIcon(root.name), tone: "dim" };
}

import { BLOB_FILTERS, type BlobFilter } from "@/blobs/filter-rows";
import type { RowSort } from "@/blobs/sort-rows";
import { Icon } from "@/components/icon";
import { routeHash } from "../app-route";
import { FILE_FILTER_CONFIG } from "./file-filters";

export type FilesLayout = "list" | "grid";

/** Every column in both directions, named as the sort control says it. */
const SORTS: readonly (RowSort & { label: string })[] = [
	{ key: "uploaded", direction: "descending", label: "newest" },
	{ key: "uploaded", direction: "ascending", label: "oldest" },
	{ key: "name", direction: "ascending", label: "name, A to Z" },
	{ key: "name", direction: "descending", label: "name, Z to A" },
	{ key: "size", direction: "descending", label: "largest" },
	{ key: "size", direction: "ascending", label: "smallest" },
	{ key: "expiry", direction: "ascending", label: "least storage left" },
	{ key: "expiry", direction: "descending", label: "most storage left" },
];

const sortValue = (sort: RowSort) => `${sort.key}:${sort.direction}`;

/**
 * The filter chips with their counts, the selection, sort, refresh and the
 * list or grid toggle. A count that cannot be real is left off, with the
 * reason in the chip's description.
 */
export function FilterBar({
	filter,
	counts,
	countNotes,
	checked,
	onClearChecked,
	sort,
	onSort,
	layout,
	onLayout,
	refreshing,
	onRefresh,
	extendExpiring,
}: {
	filter: BlobFilter;
	counts: Readonly<Record<BlobFilter, number | null>>;
	/** Why a count is missing, by filter. */
	countNotes: Readonly<Partial<Record<BlobFilter, string | undefined>>>;
	checked: number;
	onClearChecked: () => void;
	sort: RowSort;
	onSort: (sort: RowSort) => void;
	layout: FilesLayout;
	onLayout: (layout: FilesLayout) => void;
	refreshing: boolean;
	onRefresh: () => void;
	/** Opens Extend all for the expiring blobs; `null` when it does not apply. */
	extendExpiring: (() => void) | null;
}) {
	return (
		<div className="filters">
			<nav aria-label="Filters" className="chips">
				{BLOB_FILTERS.map((id) => {
					const count = counts[id];
					const note = countNotes[id];
					return (
						<a
							key={id}
							className={id === filter ? "f on" : "f"}
							href={routeHash({ view: "files", filter: id })}
							aria-current={id === filter ? "page" : undefined}
							title={note}
						>
							{FILE_FILTER_CONFIG[id].label}
							{count === null ? (
								note ? (
									<span className="sr-only">, {note}</span>
								) : null
							) : (
								<span className="n">{count}</span>
							)}
						</a>
					);
				})}
			</nav>
			<span className="sp" />
			{checked > 0 ? (
				<span className="picked" aria-live="polite">
					{checked} selected
					<button
						className="btn text sm"
						type="button"
						onClick={onClearChecked}
					>
						Clear
					</button>
				</span>
			) : null}
			{extendExpiring ? (
				<button
					className="btn primary sm"
					type="button"
					onClick={extendExpiring}
				>
					Extend these
				</button>
			) : null}
			<label className="sortby">
				<span aria-hidden="true">sort ·</span>
				<span className="sr-only">Sort by</span>
				<select
					value={sortValue(sort)}
					onChange={(event) => {
						const next = SORTS.find(
							(option) => sortValue(option) === event.target.value,
						);
						if (next) onSort({ key: next.key, direction: next.direction });
					}}
				>
					{SORTS.map((option) => (
						<option key={sortValue(option)} value={sortValue(option)}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			<button
				className="ib"
				type="button"
				aria-label="Refresh"
				title="Read your blobs from chain again"
				disabled={refreshing}
				aria-busy={refreshing}
				onClick={onRefresh}
			>
				<Icon name="refresh" size={14} />
			</button>
			<fieldset className="vw">
				<legend className="sr-only">Layout</legend>
				<button
					className={layout === "list" ? "on" : undefined}
					type="button"
					aria-pressed={layout === "list"}
					aria-label="List view"
					onClick={() => onLayout("list")}
				>
					<Icon name="list" size={14} />
				</button>
				<button
					className={layout === "grid" ? "on" : undefined}
					type="button"
					aria-pressed={layout === "grid"}
					aria-label="Grid view"
					onClick={() => onLayout("grid")}
				>
					<Icon name="grid" size={14} />
				</button>
			</fieldset>
		</div>
	);
}

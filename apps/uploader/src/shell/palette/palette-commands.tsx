import type { BlobRow } from "@/blobs/blob-row";
import type { BlobFilter } from "@/blobs/filter-rows";
import { matchesFilter } from "@/blobs/filter-rows";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { TokenAmount } from "@/components/token-amount";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import { planBulkExtend } from "@/manage/bulk-extend";
import type { AutoExtend } from "@/manage/use-auto-extend";
import type { NetworkConfig } from "@/network/networks";
import { FILE_FILTER_CONFIG } from "../files/file-filters";
import type { PaletteCommand } from "./command-palette";
import type { GoTarget } from "./shortcuts";

/** What the palette's commands do, provided by the shell. */
export interface PaletteActions {
	extendExpiring: () => void;
	extendSelected: () => void;
	setAutoExtend: (enabled: boolean) => void;
	autoExtendSettings: () => void;
	go: (target: GoTarget) => void;
	filter: (filter: BlobFilter) => void;
}

export interface PaletteState {
	network: NetworkConfig;
	listed: ListedBlobs | null;
	/** From the system object; `null` until read. */
	storagePricePerUnit: bigint | null;
	selected: readonly BlobRow[];
	/** A wallet is connected, so commands that sign can run. */
	canSign: boolean;
	autoExtend: AutoExtend | null;
}

/** Filters reachable from Go to, besides All (which is Files). */
const FILTER_TARGETS: readonly Exclude<BlobFilter, "all" | "expiring">[] = [
	"quilts",
	"encrypted",
	"published",
	"shared",
];

/**
 * The palette's commands for the app's state now: extend what is expiring
 * or selected with its cost for one epoch at the system object's price,
 * auto-extend, and the places to go. Costs and counts come from chain.
 */
export function paletteCommands(
	state: PaletteState,
	actions: PaletteActions,
): PaletteCommand[] {
	const { network, listed, storagePricePerUnit, selected, canSign } = state;
	const oneEpoch = (rows: readonly BlobRow[]) => {
		if (listed === null) return null;
		const eligible = bulkEligibility(
			"extend",
			rows,
			listed.clock,
			network.maxEpochsAhead,
		).eligible;
		const frost =
			storagePricePerUnit === null
				? null
				: planBulkExtend({
						rows: eligible,
						epochs: 1,
						clock: listed.clock,
						maxEpochsAhead: network.maxEpochsAhead,
						pricePerUnit: storagePricePerUnit,
						capFrost: null,
					}).totalFrost;
		return { count: eligible.length, frost };
	};
	const blobs = (count: number) => (count === 1 ? "1 blob" : `${count} blobs`);
	const costDetail = (quote: { count: number; frost: bigint | null }) => (
		<>
			{blobs(quote.count)}
			{quote.frost === null ? null : (
				<>
					{" "}
					· <TokenAmount raw={quote.frost} context="compact" /> WAL
				</>
			)}
		</>
	);

	const commands: PaletteCommand[] = [];
	if (canSign && listed !== null) {
		const expiring = oneEpoch(
			listed.rows.filter((row) => matchesFilter(row, "expiring")),
		);
		if (expiring && expiring.count > 0)
			commands.push({
				id: "extend-expiring",
				group: "actions",
				title: "Extend everything expiring in 30 days",
				keywords: ["extend", "renew", "storage", "expiring", "expiry"],
				detail: costDetail(expiring),
				mark: "↗",
				run: actions.extendExpiring,
			});
		const chosen = oneEpoch(selected);
		if (chosen && chosen.count > 0)
			commands.push({
				id: "extend-selected",
				group: "actions",
				title: "Extend selected by 1 epoch",
				keywords: ["extend", "renew", "selection"],
				detail: costDetail(chosen),
				mark: "↗",
				keys: "E",
				run: actions.extendSelected,
			});
	}
	const autoExtend = state.autoExtend;
	if (autoExtend) {
		const enabled = autoExtend.settings.enabled;
		commands.push(
			{
				id: enabled ? "auto-extend-off" : "auto-extend-on",
				group: "actions",
				title: enabled ? "Turn off auto-extend" : "Turn on auto-extend",
				keywords: ["auto-extend", "extend", "renew", "cap"],
				detail: (
					<>
						cap{" "}
						<TokenAmount raw={autoExtend.settings.capFrost} context="compact" />{" "}
						WAL in total
					</>
				),
				mark: "◷",
				run: () => actions.setAutoExtend(!enabled),
			},
			{
				id: "auto-extend-settings",
				group: "actions",
				title: "Auto-extend settings",
				keywords: ["auto-extend", "cap", "renew", "extend"],
				mark: "◷",
				run: actions.autoExtendSettings,
			},
		);
	}
	commands.push(
		{
			id: "go-overview",
			group: "goto",
			title: "Overview",
			keywords: ["home", "dashboard"],
			mark: "→",
			keys: "G O",
			run: () => actions.go("overview"),
		},
		{
			id: "go-timeline",
			group: "goto",
			title: "Expiry timeline",
			keywords: ["expiry", "expiring", "calendar", "months"],
			mark: "→",
			keys: "G X",
			run: () => actions.go("timeline"),
		},
		{
			id: "go-files",
			group: "goto",
			title: "Files",
			keywords: ["all", "blobs", "list"],
			mark: "→",
			keys: "G F",
			run: () => actions.go("files"),
		},
		{
			id: "go-expiring",
			group: "goto",
			title: "Expiring",
			keywords: ["filter", "expiry", "extend"],
			mark: "→",
			keys: "G E",
			run: () => actions.go("expiring"),
		},
		...FILTER_TARGETS.map(
			(filter): PaletteCommand => ({
				id: `go-${filter}`,
				group: "goto",
				title: FILE_FILTER_CONFIG[filter].label,
				keywords: ["filter", "files"],
				mark: "→",
				run: () => actions.filter(filter),
			}),
		),
		{
			id: "go-transfers",
			group: "goto",
			title: "Transfers",
			keywords: ["uploads", "queue", "progress"],
			mark: "→",
			keys: "G T",
			run: () => actions.go("transfers"),
		},
	);
	return commands;
}

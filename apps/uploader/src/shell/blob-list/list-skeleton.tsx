const PLACEHOLDER_ROWS = [1, 2, 3, 4, 5, 6] as const;

/** Placeholder rows in the list's grid while the first read of the wallet's blobs runs. */
export function ListSkeleton({ networkLabel }: { networkLabel: string }) {
	return (
		<div className="list" aria-busy="true">
			<p className="sr-only" role="status">
				Reading your blobs on {networkLabel} from chain…
			</p>
			{PLACEHOLDER_ROWS.map((row) => (
				<div key={row} className="row skel" aria-hidden="true">
					<i />
					<i />
					<i />
					<i />
					<i />
				</div>
			))}
		</div>
	);
}

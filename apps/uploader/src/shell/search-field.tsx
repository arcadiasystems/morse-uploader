/** Search over the wallet's blobs. Shown now, enabled once the blob list loads from chain. */
export function SearchField() {
	return (
		<label className="search">
			<span aria-hidden="true">⌕</span>
			<input
				type="search"
				placeholder="Search blobs, quilts, names, ids"
				aria-label="Search blobs"
				disabled
			/>
			<span className="keys" aria-hidden="true">
				<kbd>⌘K</kbd>
			</span>
		</label>
	);
}

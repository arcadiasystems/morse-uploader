import type { ReactElement } from "react";
import type { FileListProps } from "../types.js";

/**
 * Presentational list of a user's files. Pass `renderFile` to fully control a
 * row; the default row shows name, content type, and encryption state.
 */
export function FileList(props: FileListProps): ReactElement {
	const { files, renderFile, emptyLabel = "No files yet.", className } = props;
	if (files.length === 0) {
		return (
			<div className={className} data-mu="file-list-empty">
				{emptyLabel}
			</div>
		);
	}
	return (
		<ul className={className} data-mu="file-list">
			{files.map((file) => (
				<li
					key={`${file.publicationId}-${file.collectionName}-${file.entryId}`}
					data-mu="file-row"
				>
					{renderFile !== undefined ? (
						renderFile(file)
					) : (
						<>
							<span data-mu="file-name">{file.name}</span>
							<span data-mu="file-type">{file.contentType}</span>
							<span data-mu="file-encrypted">
								{file.encrypted ? "Encrypted" : "Public"}
							</span>
						</>
					)}
				</li>
			))}
		</ul>
	);
}

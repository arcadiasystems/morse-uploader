import type { FilePickers } from "../file-pickers";

/**
 * The Overview's drop zone. A drop here lands like a drop anywhere on the
 * window, which the shell takes; the buttons open the file and folder
 * pickers. Nothing is sent until the wallet signs.
 */
export function DropCard({ pickers }: { pickers: FilePickers }) {
	return (
		<div className="card span-4">
			<section className="dz" aria-label="Add files to upload">
				<b>Drop anything, anywhere</b>
				<span>
					Files and folders. They stage first; nothing is sent until you sign.
					Folders keep their structure and upload as one quilt of up to 666
					files. Up to 1 GiB per upload.
				</span>
				<span className="acts">
					<button className="btn sm" type="button" onClick={pickers.openFiles}>
						Choose files
					</button>
					<button className="btn sm" type="button" onClick={pickers.openFolder}>
						Choose folder
					</button>
				</span>
			</section>
		</div>
	);
}

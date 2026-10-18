import { ViewToggle } from "./view-toggle";

/**
 * "This computer". Hidden on phones, where uploads come from the share sheet
 * or file picker. Picking and dropping files arrives with the upload sheet.
 */
export function LocalPane() {
	return (
		<section className="pane local" aria-labelledby="pane-local-title">
			<div className="hd">
				<h3 id="pane-local-title">This computer</h3>
				<div className="acts">
					<button className="btn btn-soft xs" type="button" disabled>
						Open folder
					</button>
				</div>
			</div>
			<div className="tools">
				<button className="btn btn-ghost xs" type="button" disabled>
					New folder
				</button>
				<button className="btn btn-ghost xs" type="button" disabled>
					Select all
				</button>
				<span className="sp" />
				<ViewToggle />
			</div>
			<div className="list">
				<div className="drop">
					<b>
						Drop files or folders here <span className="chip soon">Coming</span>
					</b>
					Folders keep their structure and upload as one quilt of up to 666
					files. Up to 1 GiB per upload.
				</div>
			</div>
			<div className="ft">
				<span>
					<b>0</b> items
				</span>
				<span className="sp" />
				<span>Nothing selected</span>
			</div>
		</section>
	);
}

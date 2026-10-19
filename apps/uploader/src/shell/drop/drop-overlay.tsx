/**
 * The drop state (design/v2/app-drop.html): a dashed field over the view
 * while files are dragged over the window. It only shows during a drag, so
 * it is decoration for assistive technology; what a drop staged is
 * announced by the tray.
 */
export function DropOverlay({ connected }: { connected: boolean }) {
	return (
		<div className="dropall" aria-hidden="true" data-drop-overlay>
			<div>
				<b>{connected ? "Drop to stage" : "Connect a wallet to stage"}</b>
				<span>
					{connected
						? "Folders keep their paths and become quilts. Nothing uploads until you sign."
						: "Staged files belong to a wallet. Drop here and the wallet menu opens."}
				</span>
			</div>
		</div>
	);
}

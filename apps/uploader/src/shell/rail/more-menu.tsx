import { Icon } from "@/components/icon";
import { usePopover } from "../use-popover";

const REPOSITORY_URL = "https://github.com/arcadiasystems/morse-uploader";
const DOCS_URL = "https://docs.morsecms.xyz";

/** Planned features, shown so nobody hunts for them, and not clickable. */
const COMING_FEATURES = [
	"Desktop app",
	"One-signature batching",
	"Walrus Sites deploy",
	"Agents and keys (MCP)",
] as const;

/** The rail's More control: what is coming, and where the docs and source live. */
export function MoreMenu() {
	const popover = usePopover();
	return (
		<div className="anchor">
			<button
				ref={popover.triggerRef}
				type="button"
				className="ri"
				aria-label="More"
				title="More"
				aria-haspopup="dialog"
				aria-expanded={popover.isOpen}
				aria-controls={popover.isOpen ? popover.id : undefined}
				onClick={popover.toggle}
			>
				<Icon name="settings" size={18} />
			</button>
			{popover.isOpen ? (
				<div
					ref={popover.panelRef}
					id={popover.id}
					className="pop rail-pop"
					role="dialog"
					aria-label="More"
				>
					<section className="sec" aria-labelledby={`${popover.id}-coming`}>
						<h4 id={`${popover.id}-coming`}>Coming</h4>
						<ul className="links">
							{COMING_FEATURES.map((feature) => (
								<li key={feature}>
									<button type="button" className="soon" disabled>
										<span>
											<b>{feature}</b>
										</span>
										<span className="tag soon">Coming</span>
									</button>
								</li>
							))}
						</ul>
					</section>
					<section className="sec" aria-labelledby={`${popover.id}-about`}>
						<h4 id={`${popover.id}-about`}>About</h4>
						<ul className="links">
							<li>
								<a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
									<span>
										<b>Morse docs</b>
										<small>Publications, entries and access policies.</small>
									</span>
									<Icon name="external" size={14} />
									<span className="sr-only">(opens in a new tab)</span>
								</a>
							</li>
							<li>
								<a
									href={REPOSITORY_URL}
									target="_blank"
									rel="noopener noreferrer"
								>
									<span>
										<b>Source on GitHub</b>
										<small>Morse Uploader is MIT licensed.</small>
									</span>
									<Icon name="external" size={14} />
									<span className="sr-only">(opens in a new tab)</span>
								</a>
							</li>
						</ul>
					</section>
				</div>
			) : null}
		</div>
	);
}

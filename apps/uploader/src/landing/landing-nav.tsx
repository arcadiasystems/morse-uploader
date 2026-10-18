import Link from "next/link";
import { Brand } from "@/components/brand";
import { APP_PATH, DOCS_URL, REPOSITORY_URL } from "./links";

/** The landing's top bar: the mark, Docs and GitHub, the desktop app to come, and the app. */
export function LandingNav() {
	return (
		<nav className="nav" aria-label="Main">
			<Brand />
			<a className="nav-link" href={DOCS_URL}>
				Docs
			</a>
			<a className="nav-link" href={REPOSITORY_URL}>
				GitHub
			</a>
			<div className="nav-actions">
				{/* The desktop app is planned, not built: shown, never clickable. */}
				<button type="button" className="btn coming" disabled>
					Download for Mac <span className="soon">Coming</span>
				</button>
				<Link className="btn solid" href={APP_PATH}>
					Open in browser <span aria-hidden="true">↗</span>
				</Link>
			</div>
		</nav>
	);
}

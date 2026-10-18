import { Brand } from "@/components/brand";

/** The static frame /app ships as HTML while the wallet code loads in the browser. */
export function ShellFallback() {
	return (
		<div className="app" aria-busy="true">
			<nav className="rail" aria-label="Views">
				<span className="lg">
					<Brand wordmark={false} />
				</span>
			</nav>
			<div className="main">
				<header className="top" />
			</div>
		</div>
	);
}

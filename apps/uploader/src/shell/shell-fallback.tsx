import { Brand } from "@/components/brand";

/** The static frame /app ships as HTML while the wallet code loads in the browser. */
export function ShellFallback() {
	return (
		<div className="app" aria-busy="true">
			<header className="topbar">
				<Brand />
			</header>
			<div className="body">
				<div className="side" />
				<div className="main" />
			</div>
		</div>
	);
}

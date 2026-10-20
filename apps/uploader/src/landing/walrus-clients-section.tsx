import Link from "next/link";
import {
	CONSOLE_SOURCES,
	WALRUS_CLIENTS,
	type WalrusClient,
} from "./walrus-clients";

/** Walrus Console and Morse Uploader side by side, as two ways into Walrus. */
export function WalrusClientsSection() {
	return (
		<section className="ways" id="ways" aria-labelledby="ways-title">
			<div className="ways-head">
				<p className="eyebrow">Two ways into Walrus</p>
				<h2 id="ways-title">Walrus Console and Morse Uploader</h2>
			</div>
			<div className="ways-grid">
				{WALRUS_CLIENTS.map((client) => (
					<article key={client.id} className="way">
						<p className="eyebrow">{client.name}</p>
						<h3>{client.title}</h3>
						<p>{client.body}</p>
						<p className="best">{client.bestFor}</p>
						<ClientAction action={client.action} />
					</article>
				))}
			</div>
			<p className="ways-note">
				Both store your data on Walrus. The Console card follows Console&apos;s
				own docs:{" "}
				{CONSOLE_SOURCES.map((source, index) => (
					<span key={source.href}>
						{separator(index, CONSOLE_SOURCES.length)}
						<a href={source.href}>{source.label}</a>
					</span>
				))}
				.
			</p>
		</section>
	);
}

/** A card's way onward: into the app as the solid button, or out to Console's docs. */
function ClientAction({ action }: { action: WalrusClient["action"] }) {
	const label = (
		<>
			{action.label} <span aria-hidden="true">↗</span>
		</>
	);
	if (action.kind === "app") {
		return (
			<Link className="btn solid lg" href={action.href}>
				{label}
			</Link>
		);
	}
	return (
		<a className="btn lg" href={action.href}>
			{label}
		</a>
	);
}

/** What goes before the item at `index` in a list read as "a, b and c". */
function separator(index: number, count: number): string {
	if (index === 0) return "";
	return index === count - 1 ? " and " : ", ";
}

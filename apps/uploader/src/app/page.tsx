import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import "@/styles/landing.css";

export const metadata: Metadata = {
	title: { absolute: "Morse Uploader, a transfer client for Walrus" },
};

const REPOSITORY_URL = "https://github.com/arcadiasystems/morse-uploader";

export default function HomePage() {
	return (
		<>
			<div className="glow violet" aria-hidden="true" />
			<div className="glow teal" aria-hidden="true" />
			<div className="land">
				<nav className="nav" aria-label="Main">
					<Brand />
					<div className="right">
						<a className="btn text" href="https://docs.morsecms.xyz">
							Docs
						</a>
						<Link className="btn solid" href="/app">
							Open in browser
						</Link>
					</div>
				</nav>
				<main className="hero">
					<span className="eyebrow">FileZilla for Walrus</span>
					<h1>
						Your files on Walrus. <em>Your keys, your epochs, your records.</em>
					</h1>
					<p className="lead">
						Morse Uploader is a two-pane transfer client for Walrus that runs in
						your browser. Your wallet is the login and signs every transaction.
						No account, no API key, no custodian.
					</p>
					<div className="cta">
						<Link className="btn solid lg" href="/app">
							Open Morse Uploader
						</Link>
						<a className="btn lg" href={REPOSITORY_URL}>
							Source on GitHub
						</a>
					</div>
				</main>
				<footer className="foot">
					<span>
						Morse Uploader is an open source client for Walrus by{" "}
						<a href="https://www.morsecms.xyz">Morse</a>, MIT licensed.
					</span>
					<span className="sig" aria-hidden="true">
						-- --- .-. ... .
					</span>
				</footer>
			</div>
		</>
	);
}

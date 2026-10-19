import Link from "next/link";
import { APP_PATH, DOCS_URL } from "./links";

/** The hero: what the uploader is, in thin display type, and the two ways in. */
export function Hero() {
	return (
		<section className="hero" aria-labelledby="hero-title">
			<p className="eyebrow">Transfer client for Walrus</p>
			<h1 id="hero-title">
				Move data to Walrus.
				<br />
				<em>Keep every key.</em>
			</h1>
			<p className="lead">
				Drop folders, see the price, sign every transaction in your wallet.
				Every object your wallet owns in one place, with its storage clock, its
				record on Sui and a way to prove it is intact.
			</p>
			<div className="cta">
				<Link className="btn solid lg" href={APP_PATH}>
					Open Morse Uploader <span aria-hidden="true">↗</span>
				</Link>
				<a className="btn lg" href={DOCS_URL}>
					Read the docs
				</a>
			</div>
		</section>
	);
}

import { MORSE_URL, REPOSITORY_URL } from "./links";

export function LandingFooter() {
	return (
		<footer className="foot">
			<p>
				Morse Uploader is an <a href={REPOSITORY_URL}>open source</a> client for
				Walrus by <a href={MORSE_URL}>Morse</a>.
			</p>
			{/* "MORSE" in Morse code: a signature, not content. */}
			<span className="sig" aria-hidden="true">
				-- --- .-. ... .
			</span>
		</footer>
	);
}

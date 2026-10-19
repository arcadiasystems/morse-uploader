import Link from "next/link";

/**
 * The Trace mark, linking home: in the stacked lockup ("morse" over
 * "uploader") unless only the mark fits.
 */
export function Brand({ wordmark = true }: { wordmark?: boolean }) {
	return (
		<Link
			className={wordmark ? "brand lockup" : "brand"}
			href="/"
			aria-label="Morse Uploader home"
		>
			<svg aria-hidden="true" viewBox="0 0 100 100">
				<path
					d="M8 72 V30 H36 V72 H64 V30 H92 V72"
					fill="none"
					stroke="currentColor"
					strokeWidth="16"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			{wordmark ? (
				<span className="wm" aria-hidden="true">
					<span>morse</span>
					<em>uploader</em>
				</span>
			) : null}
		</Link>
	);
}

interface Feature {
	label: string;
	title: string;
	body: string;
}

/**
 * What the app does today, one card each: the upload sheet, the storage
 * clock, quilts and the drawer's verify, share and publish. Signature counts
 * and limits follow PROTOCOL-NOTES section 13.
 */
const FEATURES: readonly Feature[] = [
	{
		label: "Price, then sign",
		title: "Nothing uploads by surprise",
		body: "Drops open a sheet priced live from chain. Nothing leaves the browser until you confirm, and your wallet signs at least twice per upload.",
	},
	{
		label: "Storage clock",
		title: "Every blob shows its time left",
		body: "Storage left is a bar on every row and a 12-month timeline on the Overview, with one action to extend what runs out first.",
	},
	{
		label: "Quilts",
		title: "Folders stay folders",
		body: "A folder becomes one quilt of up to 666 files with its paths intact. Open it in place and share any file with its own link.",
	},
	{
		label: "Record",
		title: "Verify, share, publish",
		body: "Rebuild any blob from storage nodes to check it against its id, share an aggregator link, or attach it to a Morse publication.",
	},
];

export function FeatureCards() {
	return (
		<section className="feats" aria-labelledby="features-title">
			<h2 id="features-title" className="sr-only">
				What Morse Uploader does
			</h2>
			{FEATURES.map((feature) => (
				<article key={feature.label} className="fcard">
					<p className="eyebrow">{feature.label}</p>
					<h3>{feature.title}</h3>
					<p>{feature.body}</p>
				</article>
			))}
		</section>
	);
}

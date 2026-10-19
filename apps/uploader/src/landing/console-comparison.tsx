import { COMPARISON_ROWS, CONSOLE_SOURCES } from "./comparison";

/** Walrus Console against Morse Uploader, with where the Console column comes from. */
export function ConsoleComparison() {
	return (
		<section className="cmp" id="compare" aria-labelledby="compare-title">
			<h2 id="compare-title">
				Console is a hosted drive. Uploader is a client.
			</h2>
			{/* On phones the table keeps its columns and scrolls inside this box. */}
			<div className="cmp-scroll">
				<div className="cmp-frame">
					<table>
						<caption className="sr-only">
							Walrus Console and Morse Uploader compared
						</caption>
						<thead>
							<tr>
								<td />
								<th scope="col">Walrus Console</th>
								<th scope="col">Morse Uploader</th>
							</tr>
						</thead>
						<tbody>
							{COMPARISON_ROWS.map((row) => (
								<tr key={row.topic}>
									<th scope="row">{row.topic}</th>
									<td>{row.console}</td>
									<td className="ours">{row.uploader}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			<p className="cmp-source">
				Walrus Console column from Console&apos;s own docs:{" "}
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

/** What goes before the item at `index` in a list read as "a, b and c". */
function separator(index: number, count: number): string {
	if (index === 0) return "";
	return index === count - 1 ? " and " : ", ";
}

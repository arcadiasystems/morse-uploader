/** Inserts en-US thousands separators into a string of integer digits. */
export function groupThousands(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

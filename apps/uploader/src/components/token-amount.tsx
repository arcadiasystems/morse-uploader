import { TOKEN_DECIMALS } from "@/funds/types";
import {
	type AmountContext,
	formatTokenAmount,
} from "@/lib/format-token-amount";
import { toDecimalString } from "@/lib/to-decimal-string";

/**
 * A WAL or SUI amount from raw units. Zero-subscripts are drawn with `<sub>`
 * and read out as the full decimal; a missing amount reads as "unknown".
 */
export function TokenAmount({
	raw,
	context,
}: {
	raw: bigint | null;
	context: AmountContext;
}) {
	const formatted = formatTokenAmount(raw, TOKEN_DECIMALS, context);
	switch (formatted.kind) {
		case "missing":
			return (
				<>
					<span aria-hidden="true">--</span>
					<span className="sr-only">unknown</span>
				</>
			);
		case "plain":
			return <>{formatted.text}</>;
		case "subscript":
			return (
				<>
					<span aria-hidden="true">
						0.0<sub>{formatted.zeros}</sub>
						{formatted.digits}
					</span>
					<span className="sr-only">
						{toDecimalString(raw ?? 0n, TOKEN_DECIMALS)}
					</span>
				</>
			);
	}
}

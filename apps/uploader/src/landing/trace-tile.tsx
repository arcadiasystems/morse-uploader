import { Icon } from "@/components/icon";

/** Each tile's mark size, as the design draws them. */
const MARK_SIZE = { left: 48, right: 40 } as const;

/**
 * A glass tile carrying the Trace. The design keeps these to the landing,
 * floating beside the hero; they are decoration, so assistive tech skips them.
 */
export function TraceTile({ side }: { side: keyof typeof MARK_SIZE }) {
	return (
		<div className={`tile ${side}`} aria-hidden="true">
			<Icon name="morse" size={MARK_SIZE[side]} />
		</div>
	);
}

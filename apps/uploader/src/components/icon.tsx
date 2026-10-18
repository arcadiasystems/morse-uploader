import type { ReactNode } from "react";

interface IconShape {
	body: ReactNode;
	viewBox?: string;
	strokeWidth?: number;
}

/** Stroke icons from the design package, plus the few the shell adds. */
const ICONS = {
	folder: {
		body: (
			<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
		),
	},
	quilt: {
		body: (
			<>
				<rect x="3" y="3" width="8" height="8" rx="1.5" />
				<rect x="13" y="3" width="8" height="8" rx="1.5" />
				<rect x="3" y="13" width="8" height="8" rx="1.5" />
				<rect x="13" y="13" width="8" height="8" rx="1.5" />
			</>
		),
	},
	lock: {
		body: (
			<>
				<rect x="4" y="11" width="16" height="10" rx="2" />
				<path d="M8 11V7a4 4 0 0 1 8 0v4" />
			</>
		),
	},
	clock: {
		body: (
			<>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 7v5l3 2" />
			</>
		),
	},
	morse: {
		body: <path d="M8 72 V30 H36 V72 H64 V30 H92 V72" />,
		viewBox: "0 0 100 100",
		strokeWidth: 16,
	},
	globe: {
		body: (
			<>
				<circle cx="12" cy="12" r="9" />
				<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
			</>
		),
	},
	share: {
		body: (
			<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M7 8l5-5 5 5" />
		),
	},
	agent: {
		body: (
			<>
				<rect x="4" y="8" width="16" height="12" rx="3" />
				<path d="M12 4v4M9 14h.01M15 14h.01" />
			</>
		),
	},
	desktop: {
		body: (
			<>
				<rect x="3" y="4" width="18" height="12" rx="2" />
				<path d="M8 20h8M12 16v4" />
			</>
		),
	},
	batch: {
		body: (
			<>
				<path d="m12 3 9 5-9 5-9-5z" />
				<path d="m3 13 9 5 9-5" />
			</>
		),
	},
	wallet: {
		body: (
			<>
				<path d="M5 7V6a2 2 0 0 1 2-2h10v3" />
				<rect x="3" y="7" width="18" height="13" rx="2" />
				<path d="M16 13.5h.01" />
			</>
		),
	},
	upload: { body: <path d="M12 19V5M5 12l7-7 7 7" />, strokeWidth: 2.2 },
	list: { body: <path d="M4 7h16M4 12h16M4 17h16" />, strokeWidth: 2.2 },
	grid: {
		body: (
			<>
				<rect x="4" y="4" width="6" height="6" rx="1" />
				<rect x="14" y="4" width="6" height="6" rx="1" />
				<rect x="4" y="14" width="6" height="6" rx="1" />
				<rect x="14" y="14" width="6" height="6" rx="1" />
			</>
		),
	},
	check: { body: <path d="m5 12 5 5 9-10" />, strokeWidth: 2.4 },
	close: { body: <path d="M6 6l12 12M18 6 6 18" /> },
	copy: {
		body: (
			<>
				<rect x="9" y="9" width="11" height="11" rx="2" />
				<path d="M5 15V6a2 2 0 0 1 2-2h8" />
			</>
		),
	},
	external: {
		body: (
			<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
		),
	},
	refresh: { body: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /> },
} satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;

/** A decorative stroke icon; the surrounding control carries the accessible name. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
	const shape: IconShape = ICONS[name];
	return (
		<svg
			width={size}
			height={size}
			viewBox={shape.viewBox ?? "0 0 24 24"}
			fill="none"
			stroke="currentColor"
			strokeWidth={shape.strokeWidth ?? 2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{shape.body}
		</svg>
	);
}
